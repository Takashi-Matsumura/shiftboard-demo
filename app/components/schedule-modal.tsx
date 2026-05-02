"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

type Option = { id: string; name: string };
type Entry = {
  whoId: string | null;
  whatId: string | null;
  toWhomId: string | null;
  startAt: string | null;
  endAt: string | null;
  notes: string;
};

const EMPTY: Entry = {
  whoId: null,
  whatId: null,
  toWhomId: null,
  startAt: null,
  endAt: null,
  notes: "",
};

// ISO 文字列 (Z 付き) を datetime-local input が受け付ける
// "YYYY-MM-DDTHH:MM" 形式 (ローカル時刻) に変換する。
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// datetime-local input の値 ("YYYY-MM-DDTHH:MM", ローカル時刻) を
// PUT 用の ISO 文字列に戻す。空なら null。
function fromDatetimeLocal(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type ScheduleLabelSummary = {
  who: string | null;
  toWhom: string | null;
};

type Props = {
  cardId: string | null;
  onClose: () => void;
  onSaved?: (cardId: string, summary: ScheduleLabelSummary) => void;
};

export function ScheduleModal({ cardId, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [entry, setEntry] = useState<Entry>(EMPTY);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [tasks, setTasks] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (cardId && !dialog.open) {
      dialog.showModal();
    }
    if (!cardId && dialog.open) {
      dialog.close();
    }
  }, [cardId]);

  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntry(EMPTY);
    (async () => {
      try {
        const [employeesRes, customersRes, tasksRes, entryRes] = await Promise.all([
          fetch("/api/employees"),
          fetch("/api/customers"),
          fetch("/api/tasks"),
          fetch(`/api/schedule/${encodeURIComponent(cardId)}`),
        ]);
        const employeesBody = (await employeesRes.json().catch(() => ({}))) as {
          employees?: Option[];
          error?: string;
        };
        const customersBody = (await customersRes.json().catch(() => ({}))) as {
          customers?: Option[];
          error?: string;
        };
        const tasksBody = (await tasksRes.json().catch(() => ({}))) as {
          tasks?: Option[];
          error?: string;
        };
        const entryBody = (await entryRes.json().catch(() => ({}))) as {
          entry?: Entry | null;
          error?: string;
        };
        if (cancelled) return;
        if (!employeesRes.ok || !customersRes.ok || !tasksRes.ok || !entryRes.ok) {
          setError(
            employeesBody.error ??
              customersBody.error ??
              tasksBody.error ??
              entryBody.error ??
              "読み込みに失敗しました",
          );
          return;
        }
        setEmployees(employeesBody.employees ?? []);
        setCustomers(customersBody.customers ?? []);
        setTasks(tasksBody.tasks ?? []);
        const loaded = entryBody.entry ?? EMPTY;
        setEntry({
          ...loaded,
          startAt: toDatetimeLocal(loaded.startAt ?? null),
          endAt: toDatetimeLocal(loaded.endAt ?? null),
        });
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? "ネットワークエラー");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cardId || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/schedule/${encodeURIComponent(cardId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...entry,
          startAt: fromDatetimeLocal(entry.startAt ?? ""),
          endAt: fromDatetimeLocal(entry.endAt ?? ""),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `保存に失敗しました (${res.status})`);
        return;
      }
      const who = employees.find((o) => o.id === entry.whoId)?.name ?? null;
      const toWhom = customers.find((o) => o.id === entry.toWhomId)?.name ?? null;
      onSaved?.(cardId, { who, toWhom });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-full max-w-md rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit}>
        <div className="border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            スケジュール詳細
          </h2>
        </div>

        <div className="space-y-3 px-5 py-4">
          <fieldset disabled={loading || saving} className="space-y-3">
            <SelectField
              label="誰が"
              value={entry.whoId}
              options={employees}
              onChange={(v) => setEntry((p) => ({ ...p, whoId: v }))}
              emptyHint="未選択"
              fallbackHint="社員マスター未登録（設定パネルから登録してください）"
            />
            <SelectField
              label="何を"
              value={entry.whatId}
              options={tasks}
              onChange={(v) => setEntry((p) => ({ ...p, whatId: v }))}
              emptyHint="未選択"
              fallbackHint="業務マスター未登録（設定パネルから登録してください）"
            />
            <SelectField
              label="誰に"
              value={entry.toWhomId}
              options={customers}
              onChange={(v) => setEntry((p) => ({ ...p, toWhomId: v }))}
              emptyHint="未選択"
              fallbackHint="顧客マスター未登録（設定パネルから登録してください）"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  開始時刻
                </label>
                <input
                  type="datetime-local"
                  value={entry.startAt ?? ""}
                  onChange={(e) =>
                    setEntry((p) => ({ ...p, startAt: e.target.value }))
                  }
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none disabled:bg-neutral-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  終了時刻
                </label>
                <input
                  type="datetime-local"
                  value={entry.endAt ?? ""}
                  onChange={(e) =>
                    setEntry((p) => ({ ...p, endAt: e.target.value }))
                  }
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none disabled:bg-neutral-100"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                メモ
              </label>
              <textarea
                rows={4}
                value={entry.notes}
                onChange={(e) =>
                  setEntry((p) => ({ ...p, notes: e.target.value }))
                }
                className="w-full resize-y rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none disabled:bg-neutral-100"
              />
            </div>

            {error ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            ) : null}
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={loading || saving}
            className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            {saving || loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            <span>{loading ? "読み込み中..." : saving ? "保存中..." : "保存"}</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  emptyHint,
  fallbackHint,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (id: string | null) => void;
  emptyHint: string;
  fallbackHint: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none disabled:bg-neutral-100"
      >
        <option value="">{emptyHint}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {options.length === 0 ? (
        <p className="mt-1 text-[10px] text-neutral-500">{fallbackHint}</p>
      ) : null}
    </div>
  );
}
