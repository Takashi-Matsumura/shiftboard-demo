"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Database,
  Loader2,
  LayoutGrid,
  Save,
  Settings,
  Wrench,
  X,
} from "lucide-react";
import { AccountBadge } from "./components/account-badge";
import { DataPanel } from "./components/data-panel";
import { SettingsPanel } from "./components/settings-panel";
import { getISOWeek, getMondayOfWeek } from "@/lib/grid";

const WhiteboardCanvas = dynamic(
  () => import("./components/whiteboard-canvas"),
  { ssr: false },
);

type Mode = "view" | "edit-template";

export default function Home() {
  const router = useRouter();
  // proxy.ts は Cookie の存在しか見ないため、無効 Cookie でも / が描画される。
  // クライアント側で /api/auth/me を呼んで user が null なら /login へ送る。
  const [authState, setAuthState] = useState<"loading" | "authed">("loading");
  const [mode, setMode] = useState<Mode>("view");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 表示する週を「今週」からの相対オフセットで管理。0=今週、-1=先週、+1=来週。
  const [weekOffset, setWeekOffset] = useState(0);
  // Excalidraw のツール群 (上部ツールバー・メニュー等) の表示。デフォルトは非表示。
  // ON にすると Excalidraw 標準の zen mode を解除し、シェイプツールやメニューが出る。
  const [showTools, setShowTools] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);

  const weekLabel = useMemo(() => {
    const target = new Date();
    target.setDate(target.getDate() + weekOffset * 7);
    const monday = getMondayOfWeek(target);
    const { year, week } = getISOWeek(monday);
    return `${year}年 第${week}週`;
  }, [weekOffset]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.user) {
          setAuthState("authed");
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ページ離脱時にロックを残さないよう、unmount で unlock を試みる
  useEffect(() => {
    if (mode !== "edit-template") return;
    const onUnload = () => {
      // keepalive で fire-and-forget。失敗しても editingStartedAt から手動回復する。
      try {
        fetch("/api/template/unlock", { method: "POST", keepalive: true });
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [mode]);

  const enterEditMode = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/template/lock", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `ロック取得に失敗しました (${res.status})`);
        return;
      }
      setMode("edit-template");
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const exitEditMode = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 編集内容は debounce 済みで PUT 済みのはず。確実に flush するため少し待つ。
      await new Promise((r) => setTimeout(r, 200));
      await fetch("/api/template/unlock", { method: "POST" });
    } catch {
      // 失敗しても view へ戻す (ロックは editingStartedAt から手動回復)
    } finally {
      setMode("view");
      setBusy(false);
    }
  }, [busy]);

  const handleLockLost = useCallback(() => {
    setError("他のユーザがテンプレ編集中のため書き込めませんでした");
  }, []);

  if (authState === "loading") {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-neutral-50">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
      </main>
    );
  }

  const isEditing = mode === "edit-template";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <header
        className={`fixed top-0 right-0 left-0 z-[60] flex h-9 items-center justify-between border-b px-3 backdrop-blur-sm ${
          isEditing
            ? "border-amber-300 bg-amber-50/95"
            : "border-slate-200 bg-white/90"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-medium text-slate-700">
            shiftboard-demo
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDataOpen((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition ${
                dataOpen
                  ? "border-slate-700 bg-slate-700 text-white hover:bg-slate-800"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
              title="データパネルを開閉する"
              aria-pressed={dataOpen}
            >
              <Database className="h-3 w-3" />
              <span>データ</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition ${
                settingsOpen
                  ? "border-slate-700 bg-slate-700 text-white hover:bg-slate-800"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
              title="設定パネルを開閉する"
              aria-pressed={settingsOpen}
            >
              <Settings className="h-3 w-3" />
              <span>設定</span>
            </button>
          </div>
          {isEditing ? (
            <span className="rounded border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              テンプレ編集モード
            </span>
          ) : null}
        </div>

        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 transform">
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
              title="前週"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-xs font-medium tabular-nums text-slate-800">
              {weekLabel}
            </span>
            {weekOffset !== 0 ? (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                title="今週に戻る"
              >
                <CalendarDays className="h-3 w-3" />
                <span>今週</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
              title="次週"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AccountBadge />
        </div>
      </header>

      {error ? (
        <div className="fixed top-12 left-1/2 z-[70] -translate-x-1/2 transform">
          <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700 shadow-md">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded p-0.5 text-red-600 hover:bg-red-100"
              title="閉じる"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

      <WhiteboardCanvas
        mode={mode}
        weekOffset={weekOffset}
        topOffset={36}
        bottomOffset={36}
        showTools={showTools}
        onLockLost={handleLockLost}
      />

      <footer className="fixed right-0 bottom-0 left-0 z-[60] flex h-9 items-center justify-between gap-3 border-t border-slate-200 bg-white/90 px-3 backdrop-blur-sm">
        {/* 左: テンプレ枠 (スケジュール) の編集モード切替 */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <button
              type="button"
              onClick={exitEditMode}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-amber-500 bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm hover:bg-amber-600 disabled:opacity-60"
              title="編集を終了して通常モードに戻る"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              <span>編集を終了</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={enterEditMode}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              title="スケジュール枠 (テンプレ) を編集する"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LayoutGrid className="h-3 w-3" />}
              <span>枠を編集</span>
            </button>
          )}
        </div>

        {/* 中央: カード操作 (パレットは WhiteboardCanvas から portal で挿入される)。
            header の週ナビと同じ pattern で absolute 中央寄せ。 */}
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 transform">
          <div className="pointer-events-auto flex items-center gap-2">
            <span className="font-mono text-[10px] font-medium text-slate-500">
              カード操作
            </span>
            <div id="card-palette-slot" className="flex items-center" />
          </div>
        </div>

        {/* 右: Excalidraw ツール群の表示トグル */}
        <button
          type="button"
          onClick={() => setShowTools((v) => !v)}
          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition ${
            showTools
              ? "border-slate-700 bg-slate-700 text-white hover:bg-slate-800"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          }`}
          title="Excalidraw のツールバー・メニューの表示を切り替える"
          aria-pressed={showTools}
        >
          <Wrench className="h-3 w-3" />
          <span>ツール {showTools ? "ON" : "OFF"}</span>
        </button>
      </footer>

      <DataPanel open={dataOpen} onClose={() => setDataOpen(false)} />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}
