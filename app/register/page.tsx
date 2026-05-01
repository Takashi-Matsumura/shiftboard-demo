"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const busy = submitting || transitioning;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSubmitting(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const startedAt = performance.now();
    const MIN_MS = 400;

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "リクエストに失敗しました");
        setSubmitting(false);
        return;
      }
      setTransitioning(true);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-50 px-4">
      <div
        className={`w-full max-w-sm bg-white border border-neutral-200 rounded-xl shadow-sm p-8 transition-opacity ${
          busy ? "opacity-60" : ""
        }`}
      >
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">shiftboard-demo</h1>
        <p className="text-sm text-neutral-500 mb-6">新規アカウント登録</p>

        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                ユーザ名
              </label>
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 disabled:bg-neutral-100"
                placeholder="3〜32 文字の英数字 / _ . -"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                パスワード
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 disabled:bg-neutral-100"
                placeholder="4〜12 文字"
              />
            </div>

            {error ? (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-neutral-900 text-white text-sm font-medium py-2 rounded-md hover:bg-neutral-700 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>
                {submitting
                  ? "作成中..."
                  : transitioning
                  ? "読み込み中..."
                  : "アカウントを作成"}
              </span>
            </button>
          </fieldset>
        </form>

        <div className="mt-4 text-xs text-neutral-500">
          既にアカウントをお持ちの方は{" "}
          <Link
            href="/login"
            className="text-neutral-700 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            ログイン
          </Link>
        </div>
      </div>

      {busy ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm cursor-wait"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 rounded-lg bg-white border border-neutral-200 shadow-lg px-5 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-700" />
            <span className="text-sm text-neutral-800">
              {submitting ? "アカウントを作成しています..." : "ホワイトボードを読み込んでいます..."}
            </span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
