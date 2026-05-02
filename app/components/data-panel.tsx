"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { ChevronDown, ChevronRight, Filter, Loader2, Pencil, X } from "lucide-react";
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
  const [employees, setEmployees] = useState<Master[]>([]);
  const [customers, setCustomers] = useState<Master[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // フィルタ条件 (空文字 = 未選択)。日付は YYYY-MM-DD 形式。
  const [filterWhoId, setFilterWhoId] = useState<string>("");
  const [filterToWhomId, setFilterToWhomId] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  // フィルター UI の折りたたみ状態 (初期は閉じる)
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recordsRes, employeesRes, customersRes] = await Promise.all([
        fetch("/api/records"),
        fetch("/api/employees"),
        fetch("/api/customers"),
      ]);
      const recordsBody = (await recordsRes.json().catch(() => ({}))) as {
        records?: Record[];
        error?: string;
      };
      const employeesBody = (await employeesRes.json().catch(() => ({}))) as {
        employees?: Master[];
        error?: string;
      };
      const customersBody = (await customersRes.json().catch(() => ({}))) as {
        customers?: Master[];
        error?: string;
      };
      if (!recordsRes.ok || !employeesRes.ok || !customersRes.ok) {
        setError(
          recordsBody.error ??
            employeesBody.error ??
            customersBody.error ??
            "読み込みに失敗しました",
        );
        return;
      }
      setRecords(recordsBody.records ?? []);
      setEmployees(employeesBody.employees ?? []);
      setCustomers(customersBody.customers ?? []);
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

  // フィルタ後の records (担当 / 顧客 / 日付範囲)。
  const visibleRecords = useMemo(() => {
    const fromMs = filterDateFrom ? dateOnlyToStartMs(filterDateFrom) : null;
    const toMs = filterDateTo ? dateOnlyToEndMs(filterDateTo) : null;
    return records.filter((r) => {
      if (filterWhoId && r.who?.id !== filterWhoId) return false;
      if (filterToWhomId && r.toWhom?.id !== filterToWhomId) return false;
      if (fromMs !== null || toMs !== null) {
        const ms = new Date(r.date).getTime();
        if (Number.isNaN(ms)) return false;
        if (fromMs !== null && ms < fromMs) return false;
        if (toMs !== null && ms > toMs) return false;
      }
      return true;
    });
  }, [records, filterWhoId, filterToWhomId, filterDateFrom, filterDateTo]);

  const hasActiveFilter =
    filterWhoId !== "" ||
    filterToWhomId !== "" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  const resetFilters = () => {
    setFilterWhoId("");
    setFilterToWhomId("");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  return (
    <div
      aria-hidden={!open}
      className="fixed top-9 left-0 bottom-9 z-[75] w-1/3 [perspective:1500px]"
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <div
        className={`flex h-full w-full flex-col origin-left border-r border-slate-200 bg-white shadow-2xl [backface-visibility:hidden] ${
          open
            ? "opacity-100 [transform:rotateY(0deg)]"
            : "opacity-0 [transform:rotateY(-105deg)]"
        }`}
        style={{
          transition:
            "transform 500ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 350ms ease-out",
        }}
      >
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
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

        <div className="shrink-0 px-3 pt-2">
          <p className="text-[11px] text-slate-500">
            予定 (snapshot) と実績の記録。直近 30 日分を表示しています。
          </p>
          {error ? (
            <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-600">
              {error}
            </p>
          ) : null}

          <FilterBar
            employees={employees}
            customers={customers}
            whoId={filterWhoId}
            toWhomId={filterToWhomId}
            dateFrom={filterDateFrom}
            dateTo={filterDateTo}
            onWhoIdChange={setFilterWhoId}
            onToWhomIdChange={setFilterToWhomId}
            onDateFromChange={setFilterDateFrom}
            onDateToChange={setFilterDateTo}
            onReset={resetFilters}
            hasActive={hasActiveFilter}
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 pb-3 pt-2">
          {loading && records.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              <Loader2 className="inline h-3 w-3 animate-spin" /> 読み込み中...
            </p>
          ) : records.length === 0 ? (
            <p className="text-[11px] text-slate-400">記録なし</p>
          ) : visibleRecords.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              フィルター条件に一致する記録がありません
            </p>
          ) : (
            <RecordTable
              records={visibleRecords}
              editingId={editingId}
              onStartEdit={(id) => setEditingId(id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={(updated) => {
                setRecords((prev) =>
                  prev.map((x) => (x.id === updated.id ? updated : x)),
                );
                setEditingId(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterBar({
  employees,
  customers,
  whoId,
  toWhomId,
  dateFrom,
  dateTo,
  onWhoIdChange,
  onToWhomIdChange,
  onDateFromChange,
  onDateToChange,
  onReset,
  hasActive,
  open,
  onToggle,
}: {
  employees: Master[];
  customers: Master[];
  whoId: string;
  toWhomId: string;
  dateFrom: string;
  dateTo: string;
  onWhoIdChange: (id: string) => void;
  onToWhomIdChange: (id: string) => void;
  onDateFromChange: (s: string) => void;
  onDateToChange: (s: string) => void;
  onReset: () => void;
  hasActive: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between px-2 py-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 hover:text-slate-800"
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <Filter className="h-3 w-3" />
          <span>フィルター</span>
          {!open && hasActive ? (
            <span className="ml-1 rounded bg-slate-700 px-1 py-0 text-[9px] font-medium text-white">
              ON
            </span>
          ) : null}
        </button>
        {open && hasActive ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            リセット
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="grid grid-cols-2 gap-1.5 border-t border-slate-200 px-2 py-1.5">
          <FilterSelect
            label="担当"
            value={whoId}
            options={employees}
            onChange={onWhoIdChange}
          />
          <FilterSelect
            label="顧客"
            value={toWhomId}
            options={customers}
            onChange={onToWhomIdChange}
          />
          <FilterDate label="日付 (開始)" value={dateFrom} onChange={onDateFromChange} />
          <FilterDate label="日付 (終了)" value={dateTo} onChange={onDateToChange} />
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Master[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
      >
        <option value="">すべて</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] text-slate-500">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
      />
    </label>
  );
}

function RecordTable({
  records,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaved,
}: {
  records: Record[];
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaved: (r: Record) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr className="border-b border-slate-200 text-left text-slate-600">
            <Th className="w-[68px]">日付</Th>
            <Th className="w-[68px]">担当</Th>
            <Th className="w-[80px]">顧客</Th>
            <Th className="w-[80px]">業務</Th>
            <Th>予定</Th>
            <Th>実績</Th>
            <Th className="w-[28px]" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const editing = editingId === r.id;
            return (
              <Fragment key={r.id}>
                <tr className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                  <Td>
                    <span className="font-mono whitespace-nowrap text-slate-700">
                      {fmtDate(r.date)}
                    </span>
                  </Td>
                  <Td>
                    <Chip master={r.who} />
                  </Td>
                  <Td>
                    <Chip master={r.toWhom} />
                  </Td>
                  <Td>
                    <Chip master={r.what} />
                  </Td>
                  <Td>
                    <div className="text-slate-700">
                      {fmtTimeRange(r.plannedStartAt, r.plannedEndAt) || "—"}
                    </div>
                    {r.plannedNotes ? (
                      <div
                        className="mt-0.5 line-clamp-2 text-[10px] text-slate-500"
                        title={r.plannedNotes}
                      >
                        {r.plannedNotes}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    {r.actualStartAt || r.actualEndAt ? (
                      <div className="text-slate-700">
                        {fmtTimeRange(r.actualStartAt, r.actualEndAt)}
                      </div>
                    ) : (
                      <div className="text-slate-400">未入力</div>
                    )}
                    {r.actualNotes ? (
                      <div
                        className="mt-0.5 line-clamp-2 text-[10px] text-slate-500"
                        title={r.actualNotes}
                      >
                        {r.actualNotes}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    {!editing ? (
                      <button
                        type="button"
                        onClick={() => onStartEdit(r.id)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                        title="実績を編集"
                        aria-label="実績を編集"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    ) : null}
                  </Td>
                </tr>
                {editing ? (
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td colSpan={7} className="px-2 py-2">
                      <EditForm
                        record={r}
                        onCancel={onCancelEdit}
                        onSaved={onSaved}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-1.5 py-1 text-[10px] font-medium ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-1.5 py-1.5">{children}</td>;
}

function Chip({ master }: { master: Master | null }) {
  if (!master) {
    return <span className="text-[10px] text-slate-400">—</span>;
  }
  const palette =
    CARD_COLORS.find((c) => c.id === master.color) ?? CARD_COLORS[5];
  return (
    <span
      className="inline-block max-w-full truncate rounded border px-1.5 py-0.5 text-[10px]"
      style={{
        backgroundColor: palette.fill,
        borderColor: palette.stroke,
        color: "#0f172a",
      }}
      title={master.name}
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
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-600">
            実績開始
          </span>
          <input
            type="datetime-local"
            value={actualStartAt}
            onChange={(e) => setActualStartAt(e.target.value)}
            className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
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
            className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
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
          className="mt-0.5 w-full resize-y rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
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

// "YYYY-MM-DD" → ローカル時刻のその日の 0:00 (ms)
function dateOnlyToStartMs(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
}

// "YYYY-MM-DD" → ローカル時刻のその日の 23:59:59.999 (ms)
function dateOnlyToEndMs(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} (${DAYS_JA[d.getDay()]})`;
}

function fmtTimeRange(startIso: string | null, endIso: string | null): string {
  if (!startIso && !endIso) return "";
  const fmt = (iso: string | null) => {
    if (!iso) return "?";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "?";
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return `${fmt(startIso)}–${fmt(endIso)}`;
}
