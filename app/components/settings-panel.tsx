"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";

type Option = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsPanel({ open, onClose }: Props) {
  return (
    <div
      aria-hidden={!open}
      className="fixed top-9 right-0 bottom-9 z-[75] w-1/2 [perspective:1500px]"
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <div
        className={`h-full w-full origin-right border-l border-slate-200 bg-white shadow-2xl [backface-visibility:hidden] ${
          open
            ? "opacity-100 [transform:rotateY(0deg)]"
            : "opacity-0 [transform:rotateY(105deg)]"
        }`}
        style={{
          transition:
            "transform 500ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 350ms ease-out",
        }}
      >
        <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
          <span className="font-mono text-xs font-medium text-slate-700">
            設定
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:bg-slate-200"
            title="設定を閉じる"
            aria-label="設定を閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100%-2.25rem)] space-y-6 overflow-auto px-4 py-4">
          <MasterSection
            title="社員マスター"
            roleLabel="誰が"
            description="スケジュールの担当者として選択できる社員を登録します。"
            collectionPath="/api/employees"
            collectionKey="employees"
            active={open}
          />
          <MasterSection
            title="業務マスター"
            roleLabel="何を"
            description="スケジュールの内容として選択できる業務を登録します。"
            collectionPath="/api/tasks"
            collectionKey="tasks"
            active={open}
          />
          <MasterSection
            title="顧客マスター"
            roleLabel="誰に"
            description="スケジュールの相手として選択できる顧客を登録します。"
            collectionPath="/api/customers"
            collectionKey="customers"
            active={open}
          />
        </div>
      </div>
    </div>
  );
}

function MasterSection({
  title,
  roleLabel,
  description,
  collectionPath,
  collectionKey,
  active,
}: {
  title: string;
  roleLabel: string;
  description: string;
  collectionPath: string;
  collectionKey: "employees" | "customers" | "tasks";
  active: boolean;
}) {
  const [items, setItems] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(collectionPath);
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `読み込みに失敗しました (${res.status})`);
        return;
      }
      setItems((body[collectionKey] as Option[]) ?? []);
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setLoading(false);
    }
  }, [collectionPath, collectionKey]);

  useEffect(() => {
    if (!active) return;
    load();
  }, [active, load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || adding) return;
    setError(null);
    setAdding(true);
    try {
      const res = await fetch(collectionPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `追加に失敗しました (${res.status})`);
        return;
      }
      setName("");
      await load();
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`${collectionPath}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `削除に失敗しました (${res.status})`);
        return;
      }
      await load();
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    }
  }

  return (
    <section>
      <header className="mb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
            {roleLabel}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
      </header>

      <form onSubmit={add} className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前を入力"
          className="flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none disabled:bg-neutral-100"
          disabled={adding}
        />
        <button
          type="submit"
          disabled={adding || name.trim().length === 0}
          className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          <span>追加</span>
        </button>
      </form>

      {error ? (
        <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-600">
          {error}
        </p>
      ) : null}

      <ul className="space-y-1">
        {loading && items.length === 0 ? (
          <li className="text-[11px] text-slate-400">
            <Loader2 className="inline h-3 w-3 animate-spin" /> 読み込み中...
          </li>
        ) : items.length === 0 ? (
          <li className="text-[11px] text-slate-400">未登録</li>
        ) : (
          items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            >
              <span>{it.name}</span>
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="削除"
                aria-label={`${it.name} を削除`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
