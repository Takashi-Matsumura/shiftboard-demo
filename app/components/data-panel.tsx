"use client";

import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function DataPanel({ open, onClose }: Props) {
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
          <span className="font-mono text-xs font-medium text-slate-700">
            データ
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:bg-slate-200"
            title="データを閉じる"
            aria-label="データを閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-[calc(100%-2.25rem)] overflow-auto px-4 py-4">
          <p className="text-[11px] text-slate-400">（未実装）</p>
        </div>
      </div>
    </div>
  );
}
