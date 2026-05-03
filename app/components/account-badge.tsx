"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Users } from "lucide-react";
import { useRole } from "./role-provider";

export function AccountBadge() {
  const router = useRouter();
  const { user: me, isAdmin, refresh } = useRole();
  const [loggingOut, setLoggingOut] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const busy = loggingOut || transitioning;

  useEffect(() => {
    setMounted(true);
  }, []);

  async function logout() {
    if (busy) return;
    setLoggingOut(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const startedAt = performance.now();
    const MIN_MS = 400;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Cookie はサーバ側で破棄されているはずなので、失敗しても /login に遷移する
    }
    const elapsed = performance.now() - startedAt;
    if (elapsed < MIN_MS) {
      await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
    }
    // RoleProvider の user を null に戻す。これがないと /login にいる間も Provider が
    // 旧ユーザを保持し続け、誤った状態で / に戻れてしまう。
    await refresh();
    setTransitioning(true);
    router.replace("/login");
    router.refresh();
  }

  const overlay = busy ? (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm cursor-wait"
    >
      <div className="flex items-center gap-3 rounded-lg bg-white border border-neutral-200 shadow-lg px-5 py-4">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-700" />
        <span className="text-sm text-neutral-800">
          {loggingOut
            ? "ログアウトしています..."
            : "ログイン画面に戻っています..."}
        </span>
      </div>
    </div>
  ) : null;

  return (
    <>
      <span className="flex items-center gap-2 font-mono text-xs text-slate-500">
        <span>
          {me ? me.username : "…"}
          {me ? (
            <span
              className={`ml-1 rounded px-1 py-[1px] text-[10px] font-medium ${
                isAdmin
                  ? "bg-slate-700 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {isAdmin ? "管理者" : "一般"}
            </span>
          ) : null}
        </span>
        {isAdmin ? (
          <Link
            href="/admin/users"
            title="ユーザ管理"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="text-[11px]">ユーザ</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={logout}
          disabled={busy || !me}
          title="ログアウト"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="text-[11px]">ログアウト</span>
        </button>
      </span>
      {mounted && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}
