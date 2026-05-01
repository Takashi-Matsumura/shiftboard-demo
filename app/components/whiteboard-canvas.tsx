"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
  buildDateOverlayElements,
  buildGridElements,
  CARD_COLORS,
  CARD_KIND,
  type CardColorId,
  createCardElement,
  isCardElement,
  isGridFrameElement,
  snapToHalfHourGrid,
  stripGridElements,
} from "@/lib/grid";

const SAVE_DEBOUNCE_MS = 1500;
// 30 分グリッド最小サイズ未満のドラッグはクリック扱いで破棄
const MIN_CARD_SIZE = 16;

type LoadedData = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
} | null;

export type WhiteboardCanvasMode = "view" | "edit-template";

// Excalidraw の imperative API のうち、本コンポーネントで使う部分だけ型定義する。
type ExcalidrawLikeAPI = {
  getAppState: () => {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    offsetLeft: number;
    offsetTop: number;
  } & Record<string, unknown>;
  getSceneElements: () => readonly unknown[];
  updateScene: (data: { elements?: readonly unknown[] }) => void;
};

type DragState = {
  startClient: { x: number; y: number };
  endClient: { x: number; y: number };
};

export default function WhiteboardCanvas({
  mode = "view",
  weekOffset = 0,
  topOffset = 0,
  bottomOffset = 0,
  showTools = false,
  onLockLost,
}: {
  mode?: WhiteboardCanvasMode;
  // 表示する週を「今週」からの相対オフセット (週単位) で指定。0=今週、-1=先週、+1=来週
  weekOffset?: number;
  topOffset?: number;
  bottomOffset?: number;
  // Excalidraw のツールバー/メニュー等を表示するか。false なら zen mode で隠す。
  showTools?: boolean;
  onLockLost?: () => void;
}) {
  const [loaded, setLoaded] = useState<LoadedData>(null);
  const [loadError, setLoadError] = useState(false);
  // mode を ref に同期しておく (debounce 後の flush 内で参照するため)
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const lastSavedVersionRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{
    elements: readonly unknown[];
    appState: Record<string, unknown>;
  } | null>(null);

  // mode 切替時には Excalidraw を完全に再マウントしたいので、key として state に乗せる
  const [mountKey, setMountKey] = useState(0);

  // === カード配置 (Shift+Alt+ドラッグ) =====================================
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawLikeAPI | null>(
    null,
  );
  const [cardColor, setCardColor] = useState<CardColorId>("blue");

  // 選択中のカード集合 (id と、全員が同じ色なら uniformColor)。
  // パレットボタンの押下挙動を「選択あり: 再着色 / 選択なし: デフォルト変更」で切替えるために使う。
  const [cardSelection, setCardSelection] = useState<{
    ids: readonly string[];
    uniformColor: CardColorId | null;
  }>({ ids: [], uniformColor: null });

  const [shiftAlt, setShiftAlt] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // window レベルで Shift+Alt 状態を監視。ドラッグ中はオーバーレイの pointer-events を
  // auto にしてイベントを横取りする。
  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      setShiftAlt(e.shiftKey && e.altKey);
    };
    const onBlur = () => setShiftAlt(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // モード切替を検知して再ロード
  useEffect(() => {
    setLoaded(null);
    setLoadError(false);
    lastSavedVersionRef.current = null;
    pendingRef.current = null;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setMountKey((k) => k + 1);

    let cancel = false;

    // 動的メタ (各曜日の日付ラベル) は weekOffset を加味した日付で生成して常に inject。
    // mode に関係なく locked のまま表示し、保存対象にも含めない。
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + weekOffset * 7);
    const dateOverlay = buildDateOverlayElements(targetDate);

    async function loadView() {
      // 通常モード: テンプレ + ユーザ書き込みをマージして表示。
      // テンプレが DB に無ければ lib/grid.ts のデフォルトを使う。
      const [tplRes, wbRes] = await Promise.all([
        fetch("/api/template"),
        fetch("/api/whiteboard"),
      ]);
      if (!tplRes.ok) throw new Error(`template HTTP ${tplRes.status}`);
      if (!wbRes.ok) throw new Error(`whiteboard HTTP ${wbRes.status}`);
      const tpl = await tplRes.json();
      const wb = await wbRes.json();

      const tplElems = Array.isArray(tpl?.elements) && tpl.elements.length > 0
        ? tpl.elements
        : buildGridElements();
      // テンプレは常に locked: true で表示
      const tplLocked = (tplElems as Array<Record<string, unknown>>).map((el) => ({
        ...el,
        locked: true,
      }));

      const userElements = Array.isArray(wb?.elements) ? wb.elements : [];
      const appState = (wb?.appState ?? {}) as Record<string, unknown>;

      lastSavedVersionRef.current = getSceneVersion(userElements as never);
      if (!cancel) {
        setLoaded({
          elements: [...tplLocked, ...dateOverlay, ...userElements],
          appState,
        });
      }
    }

    async function loadEdit() {
      // 編集モード: テンプレ枠 (grid-v1) を編集対象 (locked: false)。
      // 動的メタ (grid-meta-v1) は常に locked のまま表示 (編集できない)。
      // ユーザ書き込みは半透明 readonly で参考表示。
      const [tplRes, wbRes] = await Promise.all([
        fetch("/api/template"),
        fetch("/api/whiteboard"),
      ]);
      if (!tplRes.ok) throw new Error(`template HTTP ${tplRes.status}`);
      if (!wbRes.ok) throw new Error(`whiteboard HTTP ${wbRes.status}`);
      const tpl = await tplRes.json();
      const wb = await wbRes.json();

      const tplElems = Array.isArray(tpl?.elements) && tpl.elements.length > 0
        ? tpl.elements
        : buildGridElements();
      // テンプレ枠だけ unlock。万一 DB に grid-meta が紛れていても unlock しないよう、
      // frame 判定に当てはまるものだけ touch する。
      const tplEditable = (tplElems as Array<Record<string, unknown>>).map((el) =>
        isGridFrameElement(el) ? { ...el, locked: false } : el,
      );

      const userRaw = Array.isArray(wb?.elements) ? wb.elements : [];
      // 参考表示用: 半透明 + locked
      const userFrozen = (userRaw as Array<Record<string, unknown>>).map((el) => ({
        ...el,
        opacity: 30,
        locked: true,
      }));

      // 編集モードでは frame 要素のみで version を取って差分判定する
      const tplFrameOnly = tplEditable.filter(isGridFrameElement);
      lastSavedVersionRef.current = getSceneVersion(tplFrameOnly as never);
      if (!cancel) {
        setLoaded({
          elements: [...userFrozen, ...tplEditable, ...dateOverlay],
          appState: {},
        });
      }
    }

    const loader = mode === "edit-template" ? loadEdit : loadView;
    loader().catch((err) => {
      console.warn("[whiteboard] load failed", err);
      if (!cancel) {
        lastSavedVersionRef.current = getSceneVersion([] as never);
        setLoaded({
          elements: [...buildGridElements(), ...dateOverlay],
          appState: {},
        });
        setLoadError(true);
      }
    });

    return () => {
      cancel = true;
    };
  }, [mode, weekOffset]);

  const flushSave = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    const currentMode = modeRef.current;
    const url = currentMode === "edit-template" ? "/api/template" : "/api/whiteboard";
    const body =
      currentMode === "edit-template"
        ? JSON.stringify({ elements: pending.elements })
        : JSON.stringify(pending);

    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: body.length < 60 * 1024,
    })
      .then((r) => {
        if (r.status === 423) {
          // 編集ロック取得済み他者がいるため書き込み拒否 → 親に通知
          console.warn("[whiteboard] save rejected: locked by other user");
          onLockLost?.();
        }
      })
      .catch((err) => console.warn("[whiteboard] save failed", err));
  }, [onLockLost]);

  const scheduleSave = useCallback(
    (elements: readonly unknown[], appState: Record<string, unknown>) => {
      pendingRef.current = { elements, appState };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const handleChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
    ) => {
      const currentMode = modeRef.current;

      // 選択中カードの追跡 (view モードのみ意味を持つが、edit-template でも害は無い)
      const selectedIds = (appState.selectedElementIds ?? {}) as Record<string, boolean>;
      const selectedCards = (elements as Array<{
        id?: string;
        customData?: { kind?: string; color?: string };
      }>).filter((el) => el.id && selectedIds[el.id] && isCardElement(el));
      const ids = selectedCards.map((c) => c.id as string);
      const colorSet = new Set(
        selectedCards.map((c) => c.customData?.color).filter(Boolean) as string[],
      );
      const uniform: CardColorId | null =
        colorSet.size === 1
          ? (Array.from(colorSet)[0] as CardColorId)
          : null;
      setCardSelection((prev) => {
        if (
          prev.ids.length === ids.length &&
          prev.ids.every((v, i) => v === ids[i]) &&
          prev.uniformColor === uniform
        ) {
          return prev;
        }
        return { ids, uniformColor: uniform };
      });

      if (currentMode === "edit-template") {
        // テンプレ枠 (frame) のみ保存対象。動的メタ (meta) は除外。
        const tplOnly = (elements as Array<{ customData?: unknown }>).filter((el) =>
          isGridFrameElement(el),
        );
        const v = getSceneVersion(tplOnly as never);
        if (v === lastSavedVersionRef.current) return;
        lastSavedVersionRef.current = v;
        scheduleSave(tplOnly, {});
        return;
      }

      // 通常モード: ユーザ要素のみ保存 (frame と meta の両方を除外)
      const userOnly = stripGridElements(elements as readonly { customData?: unknown }[]);
      const v = getSceneVersion(userOnly as never);
      if (v === lastSavedVersionRef.current) return;
      lastSavedVersionRef.current = v;
      const savedAppState = {
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      };
      scheduleSave(userOnly, savedAppState);
    },
    [scheduleSave],
  );

  // パレットボタン押下時のハンドラ。
  //   - カード選択中 → 選択中カードの色を変更
  //   - 選択なし     → 新規配置時のデフォルト色を変更
  const handleColorPick = useCallback(
    (id: CardColorId) => {
      if (cardSelection.ids.length > 0 && excalidrawAPI) {
        const palette = CARD_COLORS.find((c) => c.id === id) ?? CARD_COLORS[0];
        const idsSet = new Set(cardSelection.ids);
        const elements = excalidrawAPI.getSceneElements();
        const updated = (
          elements as Array<Record<string, unknown> & {
            id?: string;
            customData?: unknown;
          }>
        ).map((el) => {
            if (!el.id || !idsSet.has(el.id) || !isCardElement(el)) return el;
            const prevCustom =
              (el.customData as Record<string, unknown> | undefined) ?? {};
            return {
              ...el,
              strokeColor: palette.stroke,
              backgroundColor: palette.fill,
              customData: { ...prevCustom, kind: CARD_KIND, color: id },
              version: ((el.version as number | undefined) ?? 0) + 1,
              versionNonce: Math.floor(Math.random() * 2 ** 31),
              updated: Date.now(),
            };
          },
        );
        excalidrawAPI.updateScene({ elements: updated });
        // 全選択中カードが同じ色になるので uniformColor も追従させる
        setCardSelection((prev) => ({ ...prev, uniformColor: id }));
        return;
      }
      // 選択なし: 次に配置するカードのデフォルト色を変更
      setCardColor(id);
    },
    [cardSelection.ids, excalidrawAPI],
  );

  useEffect(() => {
    const onBeforeUnload = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      flushSave();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      onBeforeUnload();
    };
  }, [flushSave]);

  // === オーバーレイのポインタ処理 ==========================================
  // Shift+Alt 押下中のみ pointer-events: auto にしてイベントを横取りする。
  // ドラッグ開始後はキーが離されてもキャプチャを維持する。

  const cardModeAvailable = mode === "view";
  const overlayActive = cardModeAvailable && (shiftAlt || drag !== null);

  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!cardModeAvailable) return;
      if (!e.shiftKey || !e.altKey) return;
      if (!excalidrawAPI || !overlayRef.current) return;
      e.preventDefault();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setDrag({
        startClient: { x: e.clientX, y: e.clientY },
        endClient: { x: e.clientX, y: e.clientY },
      });
    },
    [cardModeAvailable, excalidrawAPI],
  );

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setDrag((prev) =>
        prev ? { ...prev, endClient: { x: e.clientX, y: e.clientY } } : prev,
      );
    },
    [],
  );

  const handleOverlayPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const api = excalidrawAPI;
      const colorId = cardColor;
      const startClient = drag.startClient;
      const endClient = { x: e.clientX, y: e.clientY };
      setDrag(null);
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {}
      if (!api) return;
      const appState = api.getAppState();
      const z = appState.zoom?.value ?? 1;
      // Excalidraw の標準変換: clientX → sceneX
      //   sceneX = (clientX - offsetLeft) / zoom - scrollX
      const sx = (startClient.x - appState.offsetLeft) / z - appState.scrollX;
      const sy = (startClient.y - appState.offsetTop) / z - appState.scrollY;
      const ex = (endClient.x - appState.offsetLeft) / z - appState.scrollX;
      const ey = (endClient.y - appState.offsetTop) / z - appState.scrollY;
      const a = snapToHalfHourGrid(sx, sy);
      const b = snapToHalfHourGrid(ex, ey);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      if (w < MIN_CARD_SIZE || h < MIN_CARD_SIZE) return;
      const card = createCardElement({
        x,
        y,
        width: w,
        height: h,
        colorId,
      });
      const elements = api.getSceneElements();
      api.updateScene({ elements: [...elements, card] });
    },
    [drag, excalidrawAPI, cardColor],
  );

  // === パレットの portal 先 (フッター内のスロット) ===========================
  // page.tsx 側で <div id="card-palette-slot" /> を用意している前提。
  // mount 時に DOM 検索し、見つかればそこに portal で挿入する。
  // setState-in-effect は DOM 由来の state を React に取り込むための正当な使い方。
  const [paletteSlot, setPaletteSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaletteSlot(document.getElementById("card-palette-slot"));
  }, []);

  // === レンダリング ========================================================

  return (
    <div
      style={{
        position: "absolute",
        top: topOffset,
        left: 0,
        right: 0,
        bottom: bottomOffset,
      }}
      onPointerDown={() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }}
    >
      {loaded ? (
        <Excalidraw
          key={mountKey}
          excalidrawAPI={(api) =>
            setExcalidrawAPI(api as unknown as ExcalidrawLikeAPI)
          }
          zenModeEnabled={!showTools}
          initialData={{
            elements: loaded.elements as never,
            appState: loaded.appState as never,
            scrollToContent: false,
          }}
          onChange={(elements, appState) =>
            handleChange(
              elements as readonly unknown[],
              appState as unknown as Record<string, unknown>,
            )
          }
        />
      ) : null}

      {/* カード作成オーバーレイ。Shift+Alt 中のみ pointer-events: auto */}
      <div
        ref={overlayRef}
        onPointerDown={handleOverlayPointerDown}
        onPointerMove={handleOverlayPointerMove}
        onPointerUp={handleOverlayPointerUp}
        onPointerCancel={handleOverlayPointerUp}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 50,
          pointerEvents: overlayActive ? "auto" : "none",
          cursor: overlayActive ? "crosshair" : "default",
        }}
      />

      {/* ドラッグ中のプレビュー (viewport coords / fixed) */}
      {drag ? <CardPreview drag={drag} colorId={cardColor} /> : null}

      {/* カラーパレット (view モードのみ)。
          - 選択中のカードがあれば「再着色」モード: クリックで選択カードの色を変更
          - 選択なしなら「デフォルト変更」モード: 次に配置するカードの色を変更
          page.tsx のフッタースロット (#card-palette-slot) に portal で挿入する。 */}
      {cardModeAvailable && paletteSlot
        ? createPortal(
            <CardPalette
              cardColor={cardColor}
              cardSelection={cardSelection}
              onPick={handleColorPick}
            />,
            paletteSlot,
          )
        : null}

      {loadError ? (
        <div className="absolute top-2 right-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 shadow-sm">
          ホワイトボードの読み込みに失敗しました (空で開始)
        </div>
      ) : null}
    </div>
  );
}

function CardPalette({
  cardColor,
  cardSelection,
  onPick,
}: {
  cardColor: CardColorId;
  cardSelection: { ids: readonly string[]; uniformColor: CardColorId | null };
  onPick: (id: CardColorId) => void;
}) {
  const recoloring = cardSelection.ids.length > 0;
  const highlightId = recoloring ? cardSelection.uniformColor : cardColor;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`text-[10px] font-medium ${
          recoloring ? "text-amber-700" : "text-slate-500"
        }`}
      >
        {recoloring
          ? `選択中 ${cardSelection.ids.length} 枚 の色変更`
          : "色"}
      </span>
      {CARD_COLORS.map((c) => {
        const selected = highlightId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            className={`inline-flex h-5 w-5 items-center justify-center rounded border-2 transition ${
              selected ? "ring-2 ring-slate-700 ring-offset-1" : "hover:scale-110"
            }`}
            style={{ backgroundColor: c.fill, borderColor: c.stroke }}
            title={c.label}
            aria-label={`カード色: ${c.label}`}
          />
        );
      })}
      {recoloring ? null : (
        <span className="ml-1 text-[10px] text-slate-500">
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-[10px]">
            ⇧
          </kbd>
          +
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-[10px]">
            ⌥
          </kbd>
          + ドラッグで配置
        </span>
      )}
    </div>
  );
}

function CardPreview({
  drag,
  colorId,
}: {
  drag: DragState;
  colorId: CardColorId;
}) {
  const palette = CARD_COLORS.find((c) => c.id === colorId) ?? CARD_COLORS[0];
  const left = Math.min(drag.startClient.x, drag.endClient.x);
  const top = Math.min(drag.startClient.y, drag.endClient.y);
  const width = Math.abs(drag.endClient.x - drag.startClient.x);
  const height = Math.abs(drag.endClient.y - drag.startClient.y);
  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        backgroundColor: palette.fill,
        border: `2px dashed ${palette.stroke}`,
        borderRadius: 6,
        pointerEvents: "none",
        opacity: 0.7,
        zIndex: 70,
      }}
    />
  );
}
