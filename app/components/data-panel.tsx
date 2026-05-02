"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { CARD_COLORS, type CardColorId } from "@/lib/grid";

type Master = { id: string; name: string; color: CardColorId };

type Record = {
  id: string;
  date: string;
  cardId: string;
  who: Master | null;
  what: Master | null;
  toWhom: Master | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  plannedNotes: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  actualNotes: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function DataPanel({ open, onClose }: Props) {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/records");
      const body = (await res.json().catch(() => ({}))) as {
        records?: Record[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `読み込みに失敗しました (${res.status})`);
        return;
      }
      setRecords(body.records ?? []);
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  return (
    <div
      aria-hidden={!open}
      className="fixed top-9 left-0 bottom-9 z-[75] w-1/3 [perspective:1500px]"
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <div
        className={`h-full w-full origin-left border-r border-slate-200 bg-white shadow-2xl [backface-visibility:hidden] ${
          open
            ? "opacity-100 [transform:rotateY(0deg)]"
            : "opacity-0 [transform:rotateY(-105deg)]"
        }`}
        style={{
          transition:
            "transform 500ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 350ms ease-out",
        }}
      >
        <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:bg-slate-200"
            title="データを閉じる"
            aria-label="データを閉じる"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="font-mono text-xs font-medium text-slate-700">
            データ
          </span>
        </div>

        <div className="h-[calc(100%-2.25rem)] overflow-auto px-3 py-3">
          <p className="mb-3 text-[11px] text-slate-500">
            予定 (snapshot) と実績の記録。直近 30 日分を表示しています。
          </p>

          {error ? (
            <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-600">
              {error}
            </p>
          ) : null}

          {loading && records.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              <Loader2 className="inline h-3 w-3 animate-spin" /> 読み込み中...
            </p>
          ) : records.length === 0 ? (
            <p className="text-[11px] text-slate-400">記録なし</p>
          ) : (
            <ul className="space-y-2">
              {records.map((r) => (
                <li key={r.id}>
                  <RecordCard
                    record={r}
                    editing={editingId === r.id}
                    onStartEdit={() => setEditingId(r.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaved={(updated) => {
                      setRecords((prev) =>
                        prev.map((x) => (x.id === updated.id ? updated : x)),
                      );
                      setEditingId(null);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordCard({
  record,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaved,
}: {
  record: Record;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (updated: Record) => void;
}) {
  const date = new Date(record.date);
  const dateLabel = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} (${DAYS_JA[date.getDay()]})`;

  return (
    <div className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium text-slate-700">
          {dateLabel}
        </span>
        {!editing ? (
          <button
            type="button"
            onClick={onStartEdit}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100"
            title="実績を編集"
          >
            <Pencil className="h-3 w-3" />
            <span>実績入力</span>
          </button>
        ) : null}
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <ColoredChip master={record.who} fallback="(担当未設定)" />
        <span className="text-slate-400">→</span>
        <ColoredChip master={record.toWhom} fallback="(顧客未設定)" />
      </div>
      {record.what ? (
        <div className="mb-1 text-[11px] text-slate-600">
          ({record.what.name})
        </div>
      ) : null}

      <div className="mt-1 grid grid-cols-[3em_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-slate-400">予定</span>
        <span className="text-slate-700">
          {fmtTimeRange(record.plannedStartAt, record.plannedEndAt)}
        </span>
        <span className="text-slate-400">実績</span>
        <span className={record.actualStartAt ? "text-slate-700" : "text-slate-400"}>
          {fmtTimeRange(record.actualStartAt, record.actualEndAt) || "未入力"}
        </span>
        {record.actualNotes ? (
          <>
            <span className="text-slate-400">メモ</span>
            <span className="whitespace-pre-wrap text-slate-700">
              {record.actualNotes}
            </span>
          </>
        ) : null}
      </div>

      {editing ? (
        <EditForm
          record={record}
          onCancel={onCancelEdit}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

function ColoredChip({
  master,
  fallback,
}: {
  master: Master | null;
  fallback: string;
}) {
  if (!master) {
    return <span className="text-[11px] text-slate-400">{fallback}</span>;
  }
  const palette = CARD_COLORS.find((c) => c.id === master.color) ?? CARD_COLORS[5];
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]"
      style={{
        backgroundColor: palette.fill,
        borderColor: palette.stroke,
        color: "#0f172a",
      }}
    >
      {master.name}
    </span>
  );
}

function EditForm({
  record,
  onCancel,
  onSaved,
}: {
  record: Record;
  onCancel: () => void;
  onSaved: (updated: Record) => void;
}) {
  const [actualStartAt, setActualStartAt] = useState(toDtLocal(record.actualStartAt));
  const [actualEndAt, setActualEndAt] = useState(toDtLocal(record.actualEndAt));
  const [actualNotes, setActualNotes] = useState(record.actualNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(record.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualStartAt: fromDtLocal(actualStartAt),
          actualEndAt: fromDtLocal(actualEndAt),
          actualNotes,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        record?: Record;
        error?: string;
      };
      if (!res.ok || !body.record) {
        setErr(body.error ?? `保存に失敗しました (${res.status})`);
        return;
      }
      onSaved(body.record);
    } catch (e2) {
      setErr((e2 as Error).message ?? "ネットワークエラー");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 border-t border-slate-100 pt-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-600">
            実績開始
          </span>
          <input
            type="datetime-local"
            value={actualStartAt}
            onChange={(e) => setActualStartAt(e.target.value)}
            className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-[11px] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-600">
            実績終了
          </span>
          <input
            type="datetime-local"
            value={actualEndAt}
            onChange={(e) => setActualEndAt(e.target.value)}
            className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-[11px] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
          />
        </label>
      </div>
      <label className="block">
        <span className="block text-[10px] font-medium text-slate-600">
          実績メモ
        </span>
        <textarea
          rows={3}
          value={actualNotes}
          onChange={(e) => setActualNotes(e.target.value)}
          className="mt-0.5 w-full resize-y rounded border border-neutral-300 px-2 py-1 text-[11px] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
        />
      </label>
      {err ? (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-600">
          {err}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1 rounded bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          <span>保存</span>
        </button>
      </div>
    </form>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDtLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDtLocal(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fmtTimeRange(startIso: string | null, endIso: string | null): string {
  if (!startIso && !endIso) return "";
  const fmt = (iso: string | null) => {
    if (!iso) return "?";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "?";
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}
