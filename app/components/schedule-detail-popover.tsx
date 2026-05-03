"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Calendar,
  Clock,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  CARD_COLORS,
  surnameInitial,
  type CardColorId,
} from "@/lib/grid";
import { useRole } from "./role-provider";

type Option = { id: string; name: string; color: CardColorId };
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

const COLOR_BY_ID: Record<CardColorId, { fill: string; stroke: string }> =
  Object.fromEntries(
    CARD_COLORS.map((c) => [c.id, { fill: c.fill, stroke: c.stroke }]),
  ) as Record<CardColorId, { fill: string; stroke: string }>;

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"];

// ポップオーバーの固定サイズ (中身は scroll 可能)
const POPOVER_W = 340;
const POPOVER_H = 360;
// anchor (元カード) との間隔
const ANCHOR_GAP = 12;
// 画面端からの最小余白
const VIEWPORT_PAD = 16;
// 出現/退場アニメ時間 (ms)
const ENTER_MS = 220;
const EXIT_MS = 160;

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseLocal(local: string | null): Date | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateWithDow(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} (${DOW_JA[d.getDay()]})`;
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(start: Date, end: Date): string {
  const diffMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (diffMin === 0) return "0分";
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

function isEntryEmpty(e: Entry): boolean {
  return (
    !e.whoId &&
    !e.whatId &&
    !e.toWhomId &&
    !e.startAt &&
    !e.endAt &&
    e.notes.trim() === ""
  );
}

export type ScheduleLabelSummary = {
  who: { name: string; color: CardColorId } | null;
  what: { name: string; color: CardColorId } | null;
  toWhom: { name: string; color: CardColorId } | null;
  startAt: string | null;
  endAt: string | null;
};

export type AnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Side = "right" | "left" | "bottom" | "top";

type Placement = {
  left: number;
  top: number;
  side: Side;
  /** transform-origin: アニメで「カード側から飛び出す」感を出すため、anchor 方向のエッジに置く */
  origin: string;
  /** 出現時の初期 translate (px) */
  translateX: number;
  translateY: number;
};

function computePlacement(anchor: AnchorRect): Placement {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const fitsRight = anchor.left + anchor.width + ANCHOR_GAP + POPOVER_W <= vw - VIEWPORT_PAD;
  const fitsLeft = anchor.left - ANCHOR_GAP - POPOVER_W >= VIEWPORT_PAD;
  const fitsBottom = anchor.top + anchor.height + ANCHOR_GAP + POPOVER_H <= vh - VIEWPORT_PAD;
  const fitsTop = anchor.top - ANCHOR_GAP - POPOVER_H >= VIEWPORT_PAD;

  const cy = anchor.top + anchor.height / 2;
  const cx = anchor.left + anchor.width / 2;
  const clampX = (x: number) =>
    Math.max(VIEWPORT_PAD, Math.min(x, vw - POPOVER_W - VIEWPORT_PAD));
  const clampY = (y: number) =>
    Math.max(VIEWPORT_PAD, Math.min(y, vh - POPOVER_H - VIEWPORT_PAD));

  // 優先順: 右 → 左 → 下 → 上 → どれも入らなければ右にフォールバックして clamp
  if (fitsRight) {
    return {
      left: anchor.left + anchor.width + ANCHOR_GAP,
      top: clampY(cy - POPOVER_H / 2),
      side: "right",
      origin: "0% 50%",
      translateX: -8,
      translateY: 0,
    };
  }
  if (fitsLeft) {
    return {
      left: anchor.left - ANCHOR_GAP - POPOVER_W,
      top: clampY(cy - POPOVER_H / 2),
      side: "left",
      origin: "100% 50%",
      translateX: 8,
      translateY: 0,
    };
  }
  if (fitsBottom) {
    return {
      left: clampX(cx - POPOVER_W / 2),
      top: anchor.top + anchor.height + ANCHOR_GAP,
      side: "bottom",
      origin: "50% 0%",
      translateX: 0,
      translateY: -8,
    };
  }
  if (fitsTop) {
    return {
      left: clampX(cx - POPOVER_W / 2),
      top: anchor.top - ANCHOR_GAP - POPOVER_H,
      side: "top",
      origin: "50% 100%",
      translateX: 0,
      translateY: 8,
    };
  }
  // フォールバック: 画面右側に押し込んで中央寄せ
  return {
    left: clampX(anchor.left + anchor.width + ANCHOR_GAP),
    top: clampY(cy - POPOVER_H / 2),
    side: "right",
    origin: "0% 50%",
    translateX: -8,
    translateY: 0,
  };
}

type Phase = "entering" | "open" | "exiting";

type Props = {
  cardId: string | null;
  anchorRect: AnchorRect | null;
  onClose: () => void;
  onSaved?: (cardId: string, summary: ScheduleLabelSummary) => void;
  onDeleted?: (cardId: string) => void;
};

export function ScheduleDetailPopover({
  cardId,
  anchorRect,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const { isAdmin } = useRole();
  // 内部 cardId を分けて持ち、退場アニメ中もマウントを維持する
  const [internalCardId, setInternalCardId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("entering");
  // 出現位置と起点はオープン時に1回計算して固定 (ホワイトボードのスクロール/ズームに振り回されない)
  const [placement, setPlacement] = useState<Placement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // 開閉トリガー
  useEffect(() => {
    if (cardId && anchorRect && internalCardId !== cardId) {
      setInternalCardId(cardId);
      setPlacement(computePlacement(anchorRect));
      setPhase("entering");
    } else if (!cardId && internalCardId) {
      setPhase("exiting");
      const t = setTimeout(() => {
        setInternalCardId(null);
        setPlacement(null);
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [cardId, anchorRect, internalCardId]);

  // entering → open の遷移を独立した effect で扱う。
  // 開閉トリガー側の cleanup と raf キャンセルを分離するため。
  useEffect(() => {
    if (phase !== "entering") return;
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const [entry, setEntry] = useState<Entry>(EMPTY);
  const [loadedEntry, setLoadedEntry] = useState<Entry>(EMPTY);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [tasks, setTasks] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [wasEmptyOnLoad, setWasEmptyOnLoad] = useState(false);

  useEffect(() => {
    if (!internalCardId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntry(EMPTY);
    setLoadedEntry(EMPTY);
    (async () => {
      try {
        const [employeesRes, customersRes, tasksRes, entryRes] = await Promise.all([
          fetch("/api/employees"),
          fetch("/api/customers"),
          fetch("/api/tasks"),
          fetch(`/api/schedule/${encodeURIComponent(internalCardId)}`),
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
        const normalized: Entry = {
          whoId: loaded.whoId ?? null,
          whatId: loaded.whatId ?? null,
          toWhomId: loaded.toWhomId ?? null,
          startAt: toDatetimeLocal(loaded.startAt ?? null),
          endAt: toDatetimeLocal(loaded.endAt ?? null),
          notes: loaded.notes ?? "",
        };
        setEntry(normalized);
        setLoadedEntry(normalized);
        const empty = isEntryEmpty(normalized);
        setWasEmptyOnLoad(empty);
        // member は空エントリでも編集モードに入れない (常に view)。
        setMode(empty && isAdmin ? "edit" : "view");
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? "ネットワークエラー");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [internalCardId]);

  // Esc で閉じる
  useEffect(() => {
    if (!internalCardId || phase === "exiting") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [internalCardId, phase, onClose]);

  // 外側クリックで閉じる (open 中のみ)
  useEffect(() => {
    if (phase !== "open") return;
    const onPointerDown = (e: PointerEvent) => {
      const node = popoverRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      onClose();
    };
    // capture フェーズで取って Excalidraw のハンドラより先に処理する
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [phase, onClose]);

  const whoOpt = useMemo(
    () => employees.find((o) => o.id === entry.whoId) ?? null,
    [employees, entry.whoId],
  );
  const whatOpt = useMemo(
    () => tasks.find((o) => o.id === entry.whatId) ?? null,
    [tasks, entry.whatId],
  );
  const toWhomOpt = useMemo(
    () => customers.find((o) => o.id === entry.toWhomId) ?? null,
    [customers, entry.toWhomId],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!internalCardId || saving) return;
    if (!isAdmin) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/schedule/${encodeURIComponent(internalCardId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...entry,
            startAt: fromDatetimeLocal(entry.startAt ?? ""),
            endAt: fromDatetimeLocal(entry.endAt ?? ""),
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `保存に失敗しました (${res.status})`);
        return;
      }
      onSaved?.(internalCardId, {
        who: whoOpt ? { name: whoOpt.name, color: whoOpt.color } : null,
        what: whatOpt ? { name: whatOpt.name, color: whatOpt.color } : null,
        toWhom: toWhomOpt
          ? { name: toWhomOpt.name, color: toWhomOpt.color }
          : null,
        startAt: fromDatetimeLocal(entry.startAt ?? ""),
        endAt: fromDatetimeLocal(entry.endAt ?? ""),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setSaving(false);
    }
  }

  const cancelEdit = useCallback(() => {
    if (wasEmptyOnLoad) {
      onClose();
      return;
    }
    setEntry(loadedEntry);
    setError(null);
    setMode("view");
  }, [wasEmptyOnLoad, loadedEntry, onClose]);

  const handleDelete = useCallback(async () => {
    if (!internalCardId || deleting) return;
    if (!isAdmin) return;
    if (!window.confirm("このスケジュールを削除しますか？")) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/schedule/${encodeURIComponent(internalCardId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `削除に失敗しました (${res.status})`);
        return;
      }
      onDeleted?.(internalCardId);
      onClose();
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setDeleting(false);
    }
  }, [internalCardId, deleting, isAdmin, onDeleted, onClose]);

  if (!internalCardId || !placement) return null;

  const accent = COLOR_BY_ID[toWhomOpt?.color ?? "slate"];

  // entering: 初期 (scale 縮小 + opacity 0 + 起点側からの translate)
  // open: 通常 (scale 1 + opacity 1 + translate 0)
  // exiting: 縮んで消える
  const isVisible = phase === "open";
  const isExiting = phase === "exiting";
  const scale = isVisible ? 1 : isExiting ? 0.96 : 0.92;
  const tx = isVisible ? 0 : isExiting ? 0 : placement.translateX;
  const ty = isVisible ? 0 : isExiting ? 0 : placement.translateY;
  const opacity = isVisible ? 1 : 0;
  // 出現時は軽くオーバーシュートする easing、退場時は素直な減衰
  const easing = isExiting
    ? "cubic-bezier(0.4, 0, 1, 1)"
    : "cubic-bezier(0.34, 1.56, 0.64, 1)";
  const duration = isExiting ? EXIT_MS : ENTER_MS;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="スケジュール詳細"
      className="absolute overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
      style={{
        zIndex: 80,
        left: placement.left,
        top: placement.top,
        width: POPOVER_W,
        height: POPOVER_H,
        opacity,
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        transformOrigin: placement.origin,
        borderLeft: `4px solid ${accent.stroke}`,
        transition: `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`,
        willChange: "transform, opacity",
      }}
    >
      <div className="flex h-full flex-col">
        {/* ヘッダー */}
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-5 py-3">
          <h2 className="flex-1 truncate text-sm font-semibold text-neutral-900">
            {mode === "view"
              ? toWhomOpt?.name ?? "(顧客未選択)"
              : wasEmptyOnLoad
                ? "スケジュール作成"
                : "スケジュール編集"}
          </h2>
          {mode === "view" && !loading && isAdmin ? (
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              <Pencil className="h-3 w-3" />
              <span>編集</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-neutral-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            読み込み中...
          </div>
        ) : mode === "view" ? (
          <ScheduleView
            who={whoOpt}
            what={whatOpt}
            startAt={parseLocal(entry.startAt)}
            endAt={parseLocal(entry.endAt)}
            notes={entry.notes}
            onDelete={handleDelete}
            deleting={deleting}
            canDelete={isAdmin}
            error={error}
          />
        ) : (
          <ScheduleForm
            entry={entry}
            setEntry={setEntry}
            employees={employees}
            customers={customers}
            tasks={tasks}
            onSubmit={submit}
            onCancel={cancelEdit}
            saving={saving}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

function ScheduleView({
  who,
  what,
  startAt,
  endAt,
  notes,
  onDelete,
  deleting,
  canDelete,
  error,
}: {
  who: Option | null;
  what: Option | null;
  startAt: Date | null;
  endAt: Date | null;
  notes: string;
  onDelete: () => void;
  deleting: boolean;
  canDelete: boolean;
  error: string | null;
}) {
  const whoColor = COLOR_BY_ID[who?.color ?? "slate"];
  const whatColor = COLOR_BY_ID[what?.color ?? "slate"];
  const sameDay =
    startAt && endAt && startAt.toDateString() === endAt.toDateString();

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-3">
          {who ? (
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold"
              style={{
                backgroundColor: whoColor.fill,
                borderColor: whoColor.stroke,
                color: whoColor.stroke,
              }}
              title={who.name}
            >
              {surnameInitial(who.name)}
            </span>
          ) : (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-neutral-300 text-xs text-neutral-400">
              ?
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-neutral-900">
              {who?.name ?? <span className="text-neutral-400">担当者未設定</span>}
            </div>
            {what ? (
              <span
                className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: whatColor.fill,
                  color: whatColor.stroke,
                }}
              >
                #{what.name}
              </span>
            ) : (
              <span className="mt-1 inline-block text-[11px] text-neutral-400">
                業務未設定
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 text-sm text-neutral-800">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
          <div>
            {startAt ? (
              formatDateWithDow(startAt)
            ) : (
              <span className="text-neutral-400">日付未設定</span>
            )}
            {!sameDay && endAt ? (
              <span className="text-neutral-500"> 〜 {formatDateWithDow(endAt)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-neutral-800">
          <Clock className="h-4 w-4 shrink-0 text-neutral-500" />
          {startAt && endAt ? (
            <>
              <span>
                {formatTime(startAt)} → {formatTime(endAt)}
              </span>
              <span className="ml-auto rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {formatDuration(startAt, endAt)}
              </span>
            </>
          ) : (
            <span className="text-neutral-400">時刻未設定</span>
          )}
        </div>

        <div className="flex items-start gap-2 text-sm">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
          {notes.trim() ? (
            <p className="whitespace-pre-wrap break-words text-neutral-800">
              {notes}
            </p>
          ) : (
            <p className="text-neutral-400">メモは未入力</p>
          )}
        </div>

        {error ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      {canDelete ? (
        <div className="flex shrink-0 items-center justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            <span>{deleting ? "削除中..." : "削除"}</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

function ScheduleForm({
  entry,
  setEntry,
  employees,
  customers,
  tasks,
  onSubmit,
  onCancel,
  saving,
  error,
}: {
  entry: Entry;
  setEntry: (updater: (prev: Entry) => Entry) => void;
  employees: Option[];
  customers: Option[];
  tasks: Option[];
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <fieldset disabled={saving} className="space-y-3">
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
              rows={3}
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

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          <span>{saving ? "保存中..." : "保存"}</span>
        </button>
      </div>
    </form>
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
