"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { Pencil } from "lucide-react";
import {
  buildDateOverlayElements,
  buildGridElements,
  cardBoundsToSchedule,
  CARD_COLORS,
  CARD_KIND,
  type CardColorId,
  createCardElement,
  createScheduleBadgeElements,
  createScheduleLabelElement,
  formatScheduleLabel,
  isCardElement,
  isGridFrameElement,
  SCHEDULE_BADGE_KIND,
  SCHEDULE_BADGE_TEXT_KIND,
  SCHEDULE_LABEL_KIND,
  scheduleLabelBounds,
  snapToHalfHourGrid,
  stripGridElements,
  surnameInitial,
} from "@/lib/grid";
import { ScheduleModal, type ScheduleLabelSummary } from "./schedule-modal";

const SAVE_DEBOUNCE_MS = 1500;
// カード移動・リサイズの「操作完了」を判定するためのアイドル時間
const TIME_SYNC_DEBOUNCE_MS = 800;
// 自動保存通知 (✓ バッジ) をカード上に残しておく時間
const SAVED_INDICATOR_MS = 1800;
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

  // カードごとの bounds (シーン座標) を保持し、変化があった card id を
  // dirty キューに溜めて debounce で /api/schedule/[cardId] へ PATCH する。
  // 移動 / リサイズ操作の完了を「最後の onChange から TIME_SYNC_DEBOUNCE_MS」で判定する。
  const cardBoundsRef = useRef<
    Map<string, { x: number; y: number; w: number; h: number }>
  >(new Map());
  const dirtyCardIdsRef = useRef<Set<string>>(new Set());
  const timeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boundsInitializedRef = useRef(false);
  const weekOffsetRef = useRef(weekOffset);
  weekOffsetRef.current = weekOffset;

  // mode 切替時には Excalidraw を完全に再マウントしたいので、key として state に乗せる
  const [mountKey, setMountKey] = useState(0);

  // === カード配置 (Shift+Alt+ドラッグ) =====================================
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawLikeAPI | null>(
    null,
  );
  // カード新規配置時の色は固定で slate (グレー)。顧客割当て後は handleScheduleSaved で
  // 顧客カラーに置き換わる。手動の再着色 UI は廃止。
  const cardColor: CardColorId = "slate";

  // 選択中のカード id 集合。「詳細」ボタンの表示条件として使う (1 枚選択時のみ表示)。
  const [cardSelection, setCardSelection] = useState<{
    ids: readonly string[];
  }>({ ids: [] });
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  // 自動保存 (PATCH) 完了直後にカードの右下へ「✓ 自動保存」を一定時間
  // 表示するための state とタイマー管理。
  const [savedCards, setSavedCards] = useState<
    ReadonlyArray<{
      id: string;
      bounds: { x: number; y: number; w: number; h: number };
    }>
  >([]);
  const savedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const [viewport, setViewport] = useState<{
    scrollX: number;
    scrollY: number;
    zoom: number;
  }>({ scrollX: 0, scrollY: 0, zoom: 1 });

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

  // カード bounds が動いたカードについて、現在表示中の週を基準に
  // startAt / endAt を計算し /api/schedule/[cardId] へ PATCH する。
  const flushTimeSync = useCallback(async () => {
    timeSyncTimerRef.current = null;
    const ids = Array.from(dirtyCardIdsRef.current);
    dirtyCardIdsRef.current.clear();
    if (ids.length === 0) return;

    await Promise.all(
      ids.map(async (id) => {
        const bounds = cardBoundsRef.current.get(id);
        if (!bounds) return;
        const result = cardBoundsToSchedule({
          card: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.w,
            height: bounds.h,
          },
          weekOffset: weekOffsetRef.current,
        });
        if (!result) return;
        try {
          const res = await fetch(`/api/schedule/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startAt: result.startAt.toISOString(),
              endAt: result.endAt.toISOString(),
            }),
          });
          if (!res.ok) return;
          // 保存完了をカード上に一定時間表示
          const latest = cardBoundsRef.current.get(id);
          if (!latest) return;
          setSavedCards((prev) => {
            const merged = new Map(prev.map((c) => [c.id, c]));
            merged.set(id, { id, bounds: { ...latest } });
            return Array.from(merged.values());
          });
          const existing = savedTimersRef.current.get(id);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            setSavedCards((prev) => prev.filter((c) => c.id !== id));
            savedTimersRef.current.delete(id);
          }, SAVED_INDICATOR_MS);
          savedTimersRef.current.set(id, timer);
        } catch {
          // 失敗は次回の操作完了で再試行される
        }
      }),
    );
  }, []);

  // unmount 時に表示用タイマーをクリーンアップ
  useEffect(() => {
    const timers = savedTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const handleChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
    ) => {
      const currentMode = modeRef.current;

      // ビューポート (スクロール / ズーム) を ref と state に同期。スピナーの位置決めに使う。
      const rawZoom = appState.zoom as { value?: number } | number | undefined;
      const zoomValue =
        typeof rawZoom === "number"
          ? rawZoom
          : (rawZoom?.value ?? 1);
      const scrollX = (appState.scrollX as number | undefined) ?? 0;
      const scrollY = (appState.scrollY as number | undefined) ?? 0;
      setViewport((prev) =>
        prev.scrollX === scrollX && prev.scrollY === scrollY && prev.zoom === zoomValue
          ? prev
          : { scrollX, scrollY, zoom: zoomValue },
      );

      // 選択中カードの追跡 (「詳細」ボタンの表示判定のみ。色は顧客連動なので uniformColor は不要)
      const selectedIds = (appState.selectedElementIds ?? {}) as Record<string, boolean>;
      const selectedCards = (elements as Array<{ id?: string; customData?: unknown }>).filter(
        (el) => el.id && selectedIds[el.id] && isCardElement(el),
      );
      const ids = selectedCards.map((c) => c.id as string);
      setCardSelection((prev) => {
        if (prev.ids.length === ids.length && prev.ids.every((v, i) => v === ids[i])) {
          return prev;
        }
        return { ids };
      });

      // 通常モードのみ: カード bounds の変化を検知して dirty キューに積む
      if (currentMode !== "edit-template") {
        const cards = (elements as Array<{
          id?: string;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          customData?: unknown;
        }>).filter((el) => el.id && isCardElement(el));
        const seen = new Set<string>();
        const newDirty: string[] = [];
        for (const card of cards) {
          const id = card.id as string;
          seen.add(id);
          const bounds = {
            x: card.x ?? 0,
            y: card.y ?? 0,
            w: card.width ?? 0,
            h: card.height ?? 0,
          };
          const prev = cardBoundsRef.current.get(id);
          if (
            boundsInitializedRef.current &&
            (!prev ||
              prev.x !== bounds.x ||
              prev.y !== bounds.y ||
              prev.w !== bounds.w ||
              prev.h !== bounds.h)
          ) {
            newDirty.push(id);
          }
          cardBoundsRef.current.set(id, bounds);
        }
        for (const id of Array.from(cardBoundsRef.current.keys())) {
          if (!seen.has(id)) cardBoundsRef.current.delete(id);
        }
        boundsInitializedRef.current = true;

        if (newDirty.length > 0) {
          for (const id of newDirty) dirtyCardIdsRef.current.add(id);
          if (timeSyncTimerRef.current) clearTimeout(timeSyncTimerRef.current);
          timeSyncTimerRef.current = setTimeout(
            flushTimeSync,
            TIME_SYNC_DEBOUNCE_MS,
          );
        }
      }

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
    [scheduleSave, flushTimeSync],
  );

  // ScheduleModal で保存されたとき、カードを「顧客カラー化 + 顧客名ラベル + 担当者バッジ」に同期する。
  //   - rectangle: 塗り/枠 = toWhom.color (なければ slate)、customData.color も追随
  //   - schedule-label-v1 text: 顧客名のみ (containerId 経由でカード中央に配置)
  //   - schedule-badge-v1 ellipse + schedule-badge-text-v1 text: 担当者の苗字 1 文字
  const handleScheduleSaved = useCallback(
    (cardId: string, summary: ScheduleLabelSummary) => {
      if (!excalidrawAPI) return;
      const elements = excalidrawAPI.getSceneElements() as readonly Record<
        string,
        unknown
      >[];
      const card = elements.find((el) => el.id === cardId) as
        | (Record<string, unknown> & {
            id: string;
            x: number;
            y: number;
            width: number;
            height: number;
            boundElements?: { type: string; id: string }[] | null;
            version?: number;
            groupIds?: string[];
          })
        | undefined;
      if (!card) return;

      const desiredColor: CardColorId = summary.toWhom?.color ?? "slate";
      const cardPalette =
        CARD_COLORS.find((c) => c.id === desiredColor) ?? CARD_COLORS[5];
      const labelText = formatScheduleLabel({ toWhom: summary.toWhom?.name ?? null });
      const badgeChar = summary.who ? surnameInitial(summary.who.name) : "";

      const customDataOf = (el: Record<string, unknown>) =>
        (el.customData as { kind?: string; cardId?: string } | undefined) ?? {};
      const matchesCard = (el: Record<string, unknown>, kind: string) => {
        const cd = customDataOf(el);
        return cd.kind === kind && cd.cardId === cardId;
      };

      const existingLabel = elements.find((el) =>
        matchesCard(el, SCHEDULE_LABEL_KIND),
      ) as (Record<string, unknown> & { id: string }) | undefined;
      const existingBadgeEllipse = elements.find((el) =>
        matchesCard(el, SCHEDULE_BADGE_KIND),
      ) as (Record<string, unknown> & { id: string }) | undefined;
      const existingBadgeText = elements.find((el) =>
        matchesCard(el, SCHEDULE_BADGE_TEXT_KIND),
      ) as (Record<string, unknown> & { id: string }) | undefined;

      const removeIds = new Set<string>();
      const additions: Record<string, unknown>[] = [];

      const bump = (el: Record<string, unknown>): Record<string, unknown> => ({
        ...el,
        version: ((el.version as number | undefined) ?? 0) + 1,
        versionNonce: Math.floor(Math.random() * 2 ** 31),
        updated: Date.now(),
      });

      // === 顧客名ラベル ===
      if (labelText === "") {
        if (existingLabel) removeIds.add(existingLabel.id);
      } else if (!existingLabel) {
        const label = createScheduleLabelElement({
          cardId,
          card: {
            x: card.x,
            y: card.y,
            width: card.width,
            height: card.height,
          },
          text: labelText,
        });
        additions.push(label);
      }
      // 既存ラベルの文字更新は下の map で処理

      // === 担当者バッジ ===
      const hasBoth = Boolean(existingBadgeEllipse && existingBadgeText);
      const wantsBadge = Boolean(summary.who);
      let recreateBadge = false;
      if (!wantsBadge) {
        if (existingBadgeEllipse) removeIds.add(existingBadgeEllipse.id);
        if (existingBadgeText) removeIds.add(existingBadgeText.id);
      } else if (!hasBoth) {
        // 片方欠損または未生成 → 両方作り直し
        if (existingBadgeEllipse) removeIds.add(existingBadgeEllipse.id);
        if (existingBadgeText) removeIds.add(existingBadgeText.id);
        recreateBadge = true;
      }
      if (recreateBadge && summary.who) {
        const { ellipse, text } = createScheduleBadgeElements({
          cardId,
          card: { x: card.x, y: card.y },
          color: summary.who.color,
          char: badgeChar,
        });
        additions.push(ellipse, text);
      }
      // 既存バッジの色/文字更新は下の map で処理

      // === card.boundElements / groupIds の再計算 ===
      // ラベル / バッジは containerId を使わず groupIds で連動させるため、
      // boundElements からは削除する (旧データの掃除も兼ねる)。
      const nextBoundElements = (card.boundElements ?? []).filter(
        (b) => !removeIds.has(b.id) && b.id !== existingLabel?.id,
      );
      const wantsGroup = wantsBadge || labelText !== "";
      const nextGroupIds = (() => {
        const prev = (card.groupIds ?? []).filter((g) => g !== cardId);
        return wantsGroup ? [...prev, cardId] : prev;
      })();

      const next = elements
        .filter((el) => !removeIds.has(((el as { id?: string }).id ?? "")))
        .map((el) => {
          const elId = (el as { id?: string }).id;

          // カード本体: 色 + boundElements + groupIds + 角を正方形化
          if (elId === cardId) {
            const prevCustom =
              ((el as Record<string, unknown>).customData as Record<
                string,
                unknown
              > | undefined) ?? {};
            return bump({
              ...el,
              strokeColor: cardPalette.stroke,
              backgroundColor: cardPalette.fill,
              roundness: null,
              customData: { ...prevCustom, kind: CARD_KIND, color: desiredColor },
              boundElements:
                nextBoundElements.length > 0 ? nextBoundElements : null,
              groupIds: nextGroupIds,
            });
          }

          // 既存ラベル: テキスト更新 + bbox 再計算でカード中央へ + containerId 解除
          if (
            existingLabel &&
            elId === existingLabel.id &&
            labelText !== ""
          ) {
            const b = scheduleLabelBounds({
              x: card.x,
              y: card.y,
              width: card.width,
              height: card.height,
            });
            return bump({
              ...(el as Record<string, unknown>),
              text: labelText,
              originalText: labelText,
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              containerId: null,
              autoResize: false,
              groupIds: [cardId],
              textAlign: "center",
              verticalAlign: "middle",
            });
          }

          // 既存バッジ ellipse: 色更新
          if (
            wantsBadge &&
            hasBoth &&
            existingBadgeEllipse &&
            elId === existingBadgeEllipse.id &&
            summary.who
          ) {
            const prevCustom =
              ((el as Record<string, unknown>).customData as Record<
                string,
                unknown
              > | undefined) ?? {};
            const p =
              CARD_COLORS.find((c) => c.id === summary.who!.color) ??
              CARD_COLORS[5];
            return bump({
              ...(el as Record<string, unknown>),
              strokeColor: p.stroke,
              backgroundColor: p.fill,
              customData: {
                ...prevCustom,
                kind: SCHEDULE_BADGE_KIND,
                cardId,
                color: summary.who.color,
              },
            });
          }

          // 既存バッジ text: 1 文字更新 + ellipse 中央へ手動配置
          if (
            wantsBadge &&
            hasBoth &&
            existingBadgeText &&
            existingBadgeEllipse &&
            elId === existingBadgeText.id
          ) {
            const ex =
              (existingBadgeEllipse.x as number | undefined) ?? card.x;
            const ey =
              (existingBadgeEllipse.y as number | undefined) ?? card.y;
            const ew =
              (existingBadgeEllipse.width as number | undefined) ?? 24;
            const eh =
              (existingBadgeEllipse.height as number | undefined) ?? 24;
            const cLine = 14 * 1.25;
            return bump({
              ...(el as Record<string, unknown>),
              text: badgeChar,
              originalText: badgeChar,
              x: ex,
              y: ey + (eh - cLine) / 2,
              width: ew,
              height: cLine,
              containerId: null,
              autoResize: false,
              groupIds: [cardId],
              textAlign: "center",
              verticalAlign: "middle",
            });
          }

          return el;
        });

      excalidrawAPI.updateScene({
        elements: [...next, ...additions] as never,
      });
    },
    [excalidrawAPI],
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
      className={showTools ? undefined : "shiftboard-tools-hidden"}
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

      {/* 時刻同期 (PATCH) 中のカード上に表示するスピナー。
          シーン座標 → Excalidraw 表示エリア内のローカル座標へ変換。 */}
      {savedCards.length > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 60 }}
        >
          {savedCards.map(({ id, bounds }) => {
            const left = (bounds.x + viewport.scrollX) * viewport.zoom;
            const top = (bounds.y + viewport.scrollY) * viewport.zoom;
            const width = bounds.w * viewport.zoom;
            const height = bounds.h * viewport.zoom;
            return (
              <div
                key={id}
                className="absolute flex items-end justify-center p-1"
                style={{ left, top, width, height }}
              >
                <span className="inline-flex items-center rounded-full bg-neutral-900/90 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                  saving...
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* カード操作ヒント (view モードのみ)。
          色は顧客カラーで自動決定するためパレットは廃止し、配置方法だけ案内する。
          page.tsx のフッタースロット (#card-palette-slot) に portal で挿入する。 */}
      {cardModeAvailable && paletteSlot
        ? createPortal(<CardPlacementHint />, paletteSlot)
        : null}

      {cardModeAvailable && paletteSlot && cardSelection.ids.length === 1
        ? createPortal(
            <button
              type="button"
              onClick={() => setActiveCardId(cardSelection.ids[0] ?? null)}
              className="ml-2 inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
              title="選択中のカードの詳細を編集"
            >
              <Pencil className="h-3 w-3" />
              <span>詳細</span>
            </button>,
            paletteSlot,
          )
        : null}

      <ScheduleModal
        cardId={activeCardId}
        onClose={() => setActiveCardId(null)}
        onSaved={handleScheduleSaved}
      />

      {loadError ? (
        <div className="absolute top-2 right-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 shadow-sm">
          ホワイトボードの読み込みに失敗しました (空で開始)
        </div>
      ) : null}
    </div>
  );
}

function CardPlacementHint() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-slate-500">
        <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-[10px]">
          ⇧
        </kbd>
        +
        <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-[10px]">
          ⌥
        </kbd>
        + ドラッグで配置
      </span>
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
