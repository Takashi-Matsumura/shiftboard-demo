"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { buildGridElements, isGridElement, stripGridElements } from "@/lib/grid";

const SAVE_DEBOUNCE_MS = 1500;

type LoadedData = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
} | null;

export type WhiteboardCanvasMode = "view" | "edit-template";

export default function WhiteboardCanvas({
  mode = "view",
  topOffset = 0,
  onLockLost,
}: {
  mode?: WhiteboardCanvasMode;
  topOffset?: number;
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
          elements: [...tplLocked, ...userElements],
          appState,
        });
      }
    }

    async function loadEdit() {
      // 編集モード: テンプレを編集対象 (locked: false)、ユーザ書き込みは半透明 readonly で参考表示
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
      // 編集対象は unlock
      const tplEditable = (tplElems as Array<Record<string, unknown>>).map((el) => ({
        ...el,
        locked: false,
      }));

      const userRaw = Array.isArray(wb?.elements) ? wb.elements : [];
      // 参考表示用: 半透明 + locked
      const userFrozen = (userRaw as Array<Record<string, unknown>>).map((el) => ({
        ...el,
        opacity: 30,
        locked: true,
      }));

      // 編集モードでは template 要素のバージョンで差分判定
      lastSavedVersionRef.current = getSceneVersion(tplElems as never);
      if (!cancel) {
        setLoaded({
          elements: [...userFrozen, ...tplEditable],
          appState: {},
        });
      }
    }

    const loader = mode === "edit-template" ? loadEdit : loadView;
    loader().catch((err) => {
      console.warn("[whiteboard] load failed", err);
      if (!cancel) {
        lastSavedVersionRef.current = getSceneVersion([] as never);
        setLoaded({ elements: buildGridElements(), appState: {} });
        setLoadError(true);
      }
    });

    return () => {
      cancel = true;
    };
  }, [mode]);

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

      if (currentMode === "edit-template") {
        // テンプレ要素のみ抽出 (grid customData を持つもの)
        const tplOnly = (elements as Array<{ customData?: unknown }>).filter((el) =>
          isGridElement(el),
        );
        const v = getSceneVersion(tplOnly as never);
        if (v === lastSavedVersionRef.current) return;
        lastSavedVersionRef.current = v;
        scheduleSave(tplOnly, {});
        return;
      }

      // 通常モード: ユーザ要素のみ保存
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

  return (
    <div
      style={{
        position: "absolute",
        top: topOffset,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      onPointerDown={() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }}
    >
      {loaded ? (
        <Excalidraw
          key={mountKey}
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
      {loadError ? (
        <div className="absolute top-2 right-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 shadow-sm">
          ホワイトボードの読み込みに失敗しました (空で開始)
        </div>
      ) : null}
    </div>
  );
}
