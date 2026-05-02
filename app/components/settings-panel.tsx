"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { CARD_COLORS, type CardColorId } from "@/lib/grid";

type Option = { id: string; name: string; color: CardColorId };

type Props = {
  open: boolean;
  onClose: () => void;
};

type TabId = "employees" | "tasks" | "customers";

const TABS: ReadonlyArray<{
  id: TabId;
  label: string;
  roleLabel: string;
  description: string;
  collectionPath: string;
  collectionKey: "employees" | "tasks" | "customers";
}> = [
  {
    id: "employees",
    label: "社員マスター",
    roleLabel: "誰が",
    description: "スケジュールの担当者として選択できる社員を登録します。",
    collectionPath: "/api/employees",
    collectionKey: "employees",
  },
  {
    id: "tasks",
    label: "業務マスター",
    roleLabel: "何を",
    description: "スケジュールの内容として選択できる業務を登録します。",
    collectionPath: "/api/tasks",
    collectionKey: "tasks",
  },
  {
    id: "customers",
    label: "顧客マスター",
    roleLabel: "誰に",
    description: "スケジュールの相手として選択できる顧客を登録します。",
    collectionPath: "/api/customers",
    collectionKey: "customers",
  },
];

export function SettingsPanel({ open, onClose }: Props) {
  const [active, setActive] = useState<TabId>("employees");
  const current = useMemo(() => TABS.find((t) => t.id === active) ?? TABS[0], [active]);

  return (
    <div
      aria-hidden={!open}
      className="fixed top-9 right-0 bottom-9 z-[75] w-1/3 [perspective:1500px]"
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

        <div role="tablist" aria-label="マスター切替" className="flex border-b border-slate-200 bg-white px-2">
          {TABS.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActive(t.id)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-neutral-900 text-neutral-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>{t.label}</span>
                <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                  {t.roleLabel}
                </span>
              </button>
            );
          })}
        </div>

        <div className="h-[calc(100%-2.25rem-2.5rem)] overflow-auto px-4 py-4">
          <MasterSection
            key={current.id}
            description={current.description}
            collectionPath={current.collectionPath}
            collectionKey={current.collectionKey}
            active={open}
          />
        </div>
      </div>
    </div>
  );
}

function MasterSection({
  description,
  collectionPath,
  collectionKey,
  active,
}: {
  description: string;
  collectionPath: string;
  collectionKey: "employees" | "customers" | "tasks";
  active: boolean;
}) {
  const [items, setItems] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [newColor, setNewColor] = useState<CardColorId>("slate");
  const [error, setError] = useState<string | null>(null);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

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
        body: JSON.stringify({ name: trimmed, color: newColor }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `追加に失敗しました (${res.status})`);
        return;
      }
      setName("");
      setNewColor("slate");
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

  async function updateColor(id: string, color: CardColorId) {
    setError(null);
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, color } : it)));
    setOpenPickerId(null);
    try {
      const res = await fetch(`${collectionPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `色の更新に失敗しました (${res.status})`);
        await load();
      }
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
      await load();
    }
  }

  return (
    <section>
      <p className="mb-3 text-[11px] text-slate-500">{description}</p>

      <form onSubmit={add} className="mb-2 flex items-center gap-2">
        <ColorSwatchPicker
          value={newColor}
          onChange={setNewColor}
          ariaLabel="新規追加の色"
        />
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
              className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            >
              <ColorSwatchPicker
                value={it.color}
                onChange={(c) => updateColor(it.id, c)}
                ariaLabel={`${it.name} の色`}
                openExternally={openPickerId === it.id}
                onOpenChange={(o) => setOpenPickerId(o ? it.id : null)}
              />
              <span className="flex-1 truncate">{it.name}</span>
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

function ColorSwatchPicker({
  value,
  onChange,
  ariaLabel,
  openExternally,
  onOpenChange,
}: {
  value: CardColorId;
  onChange: (color: CardColorId) => void;
  ariaLabel: string;
  openExternally?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openExternally ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const palette = CARD_COLORS.find((c) => c.id === value) ?? CARD_COLORS[5];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-5 w-5 shrink-0 rounded-full border transition-transform hover:scale-110"
        style={{ backgroundColor: palette.fill, borderColor: palette.stroke }}
        title={`色: ${palette.label}`}
        aria-label={ariaLabel}
        aria-expanded={open}
      />
      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="listbox"
            className="absolute top-full left-0 z-20 mt-1 flex gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-md"
          >
            {CARD_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === value}
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className={`h-5 w-5 rounded-full border ${
                  c.id === value ? "ring-2 ring-offset-1 ring-neutral-900" : ""
                }`}
                style={{ backgroundColor: c.fill, borderColor: c.stroke }}
                title={c.label}
                aria-label={c.label}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
