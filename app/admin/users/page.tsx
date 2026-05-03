"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck, User as UserIcon } from "lucide-react";
import { useRole } from "../../components/role-provider";

type Role = "admin" | "member";
type AdminUserRow = {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user: me, isAdmin, loading: roleLoading } = useRole();

  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // role が確定 → admin でなければ即トップへ。member 直打ちは API 側の requireAdmin で 403 になる。
  useEffect(() => {
    if (roleLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (!isAdmin) {
      router.replace("/");
    }
  }, [roleLoading, me, isAdmin, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `読み込みに失敗しました (${res.status})`);
        return;
      }
      const data = (await res.json()) as { users?: AdminUserRow[] };
      setUsers(data.users ?? []);
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void reload();
  }, [isAdmin, reload]);

  const adminCount = useMemo(
    () => (users ?? []).filter((u) => u.role === "admin").length,
    [users],
  );

  const onChangeRole = useCallback(
    async (target: AdminUserRow, nextRole: Role) => {
      if (pendingId) return;
      const verb = nextRole === "admin" ? "管理者に昇格" : "一般ユーザに変更";
      if (!window.confirm(`${target.username} を${verb}しますか？`)) return;
      setPendingId(target.id);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/users/${encodeURIComponent(target.id)}/role`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: nextRole }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `変更に失敗しました (${res.status})`);
          return;
        }
        await reload();
      } catch (err) {
        setError((err as Error).message ?? "ネットワークエラー");
      } finally {
        setPendingId(null);
      }
    },
    [pendingId, reload],
  );

  if (roleLoading || !me || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              title="ホームに戻る"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>戻る</span>
            </Link>
            <h1 className="text-sm font-semibold text-slate-800">ユーザ管理</h1>
          </div>
          <span className="font-mono text-xs text-slate-500">
            {me.username}
            <span className="ml-1 rounded bg-slate-700 px-1 py-[1px] text-[10px] font-medium text-white">
              管理者
            </span>
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-6">
        {error ? (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">ユーザ名</th>
                <th className="px-3 py-2 font-medium">権限</th>
                <th className="px-3 py-2 font-medium">登録日</th>
                <th className="px-3 py-2 font-medium text-right">アクション</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : (users ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-400">
                    ユーザがいません
                  </td>
                </tr>
              ) : (
                (users ?? []).map((u) => {
                  const isMe = u.id === me.id;
                  const isLastAdmin = u.role === "admin" && adminCount <= 1;
                  const promoteDisabled = pendingId !== null;
                  const demoteDisabled =
                    pendingId !== null || isMe || isLastAdmin;
                  const demoteTitle = isMe
                    ? "自分自身は降格できません"
                    : isLastAdmin
                      ? "最後の管理者は降格できません"
                      : "一般ユーザに変更";
                  return (
                    <tr
                      key={u.id}
                      className="border-t border-slate-100 last:border-b-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">
                        {u.username}
                        {isMe ? (
                          <span className="ml-1 text-[10px] text-slate-400">
                            (自分)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {u.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-700 px-1.5 py-[1px] text-[11px] font-medium text-white">
                            <ShieldCheck className="h-3 w-3" />
                            管理者
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-[1px] text-[11px] font-medium text-slate-700">
                            <UserIcon className="h-3 w-3" />
                            一般
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {u.role === "member" ? (
                          <button
                            type="button"
                            onClick={() => onChangeRole(u, "admin")}
                            disabled={promoteDisabled}
                            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {pendingId === u.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3 w-3" />
                            )}
                            <span>管理者にする</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onChangeRole(u, "member")}
                            disabled={demoteDisabled}
                            title={demoteTitle}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            {pendingId === u.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <UserIcon className="h-3 w-3" />
                            )}
                            <span>一般にする</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[11px] text-slate-500">
          権限変更は対象ユーザがリロードするまで反映されません。
        </p>
      </section>
    </main>
  );
}
