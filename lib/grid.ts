// 社内チーム用の週間スケジュール枠を Excalidraw element として生成する。
// 枠は DB に保存しない方針で、クライアント側で毎回 buildGridElements() を呼んで inject する。
// すべての element は locked: true でユーザ要素と区別される。
//
// customData.kind の使い分け:
//   - GRID_KIND_FRAME ("grid-v1")     : 編集可能なテンプレ枠 (曜日ヘッダ・罫線・時刻ラベル)。
//                                       テンプレ編集モードで unlock され、Template テーブルに保存される。
//   - GRID_KIND_META  ("grid-meta-v1"): 動的メタ情報 (年・週番号・日付ラベル)。
//                                       毎回クライアント側で「現在日付」から再生成される。保存されない。
//                                       テンプレ編集モードでも編集できない (常に locked)。

export const GRID_KIND_FRAME = "grid-v1";
export const GRID_KIND_META = "grid-meta-v1";
// 後方互換: 既存呼び出しの import { GRID_KIND } を維持
export const GRID_KIND = GRID_KIND_FRAME;

export const GRID = {
  origin: { x: 100, y: 100 },
  // ヘッダ rect は 2 段構成 (上半分 = 日付、下半分 = 曜日)。両段とも同じ高さ・同じフォント。
  headerHeight: 60,
  dateBandHeight: 30, // ヘッダの上半分: 日付ラベル
  labelGutter: 60,
  colWidth: 200,
  rowHeight: 40,
  hoursStart: 6,
  hoursEnd: 21, // 21:00 のラインも引く → 30 分行数 = (21-6)*2 = 30
  daysJa: ["月", "火", "水", "木", "金", "土", "日"] as const,
  // 視覚スタイル
  colorMajor: "#94a3b8", // slate-400
  colorMinor: "#e2e8f0", // slate-200
  colorText: "#0f172a", // slate-900
  colorHeaderBg: "#f1f5f9", // slate-100
  colorSatBg: "#dbeafe", // blue-100
  colorSunBg: "#fee2e2", // red-100
  fontSize: 14,
  fontFamilyHelvetica: 5, // Excalidraw の FONT_FAMILY.Helvetica
} as const;

type AnyElement = Record<string, unknown>;

function commonBase(id: string, seedSalt: number, kind: string): AnyElement {
  return {
    id,
    locked: true,
    customData: { kind },
    groupIds: ["shiftboard-grid"],
    frameId: null,
    boundElements: null,
    link: null,
    isDeleted: false,
    angle: 0,
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: 1000 + seedSalt,
    version: 1,
    versionNonce: 1,
    index: null,
    updated: 0,
  };
}

function rectangle(args: {
  id: string;
  seedSalt: number;
  kind?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  stroke: string;
  strokeWidth?: number;
}): AnyElement {
  return {
    ...commonBase(args.id, args.seedSalt, args.kind ?? GRID_KIND_FRAME),
    type: "rectangle",
    x: args.x,
    y: args.y,
    width: args.w,
    height: args.h,
    strokeColor: args.stroke,
    backgroundColor: args.bg,
    fillStyle: "solid",
    strokeWidth: args.strokeWidth ?? 1,
    strokeStyle: "solid",
  };
}

function line(args: {
  id: string;
  seedSalt: number;
  kind?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  points: [number, number][];
  stroke: string;
  strokeWidth: number;
}): AnyElement {
  return {
    ...commonBase(args.id, args.seedSalt, args.kind ?? GRID_KIND_FRAME),
    type: "line",
    x: args.x,
    y: args.y,
    width: args.w,
    height: args.h,
    strokeColor: args.stroke,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: args.strokeWidth,
    strokeStyle: "solid",
    points: args.points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  };
}

function text(args: {
  id: string;
  seedSalt: number;
  kind?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  align?: "left" | "center" | "right";
  color?: string;
  fontSize?: number;
}): AnyElement {
  const align = args.align ?? "center";
  return {
    ...commonBase(args.id, args.seedSalt, args.kind ?? GRID_KIND_FRAME),
    type: "text",
    x: args.x,
    y: args.y,
    width: args.w,
    height: args.h,
    strokeColor: args.color ?? GRID.colorText,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    fontSize: args.fontSize ?? GRID.fontSize,
    fontFamily: GRID.fontFamilyHelvetica,
    text: args.text,
    textAlign: align,
    verticalAlign: "middle",
    containerId: null,
    originalText: args.text,
    autoResize: true,
    lineHeight: 1.25,
  };
}

// === 日付計算ヘルパー ==================================================

// ISO 8601 週番号 (週の開始は月曜、年初の最初の木曜を含む週が第1週)
export function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO の規約: 月曜=1 ... 日曜=7。木曜を含む週でその週の年が決まる。
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

// 与えられた日付と同じ週の月曜 0:00:00 を返す (ローカル時刻基準)
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=日, 1=月, ..., 6=土
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatMd(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// === 要素生成 ============================================================

export function buildGridElements(): readonly unknown[] {
  const els: AnyElement[] = [];
  const {
    origin,
    headerHeight,
    labelGutter,
    colWidth,
    rowHeight,
    hoursStart,
    hoursEnd,
    daysJa,
    dateBandHeight,
  } = GRID;

  const rowsCount = (hoursEnd - hoursStart) * 2; // 30 分行数

  // 1. 曜日ヘッダ rectangle 7 個
  for (let d = 0; d < 7; d++) {
    const isSat = d === 5;
    const isSun = d === 6;
    const bg = isSat ? GRID.colorSatBg : isSun ? GRID.colorSunBg : GRID.colorHeaderBg;
    els.push(
      rectangle({
        id: `grid:header:${d}`,
        seedSalt: 100 + d,
        x: origin.x + labelGutter + d * colWidth,
        y: origin.y,
        w: colWidth,
        h: headerHeight,
        bg,
        stroke: GRID.colorMajor,
        strokeWidth: 1.5,
      }),
    );
  }

  // 2. 曜日ヘッダ text 7 個 (rect の下半分に配置、上半分は日付ラベル用に空けておく)
  for (let d = 0; d < 7; d++) {
    els.push(
      text({
        id: `grid:headerLabel:${d}`,
        seedSalt: 200 + d,
        x: origin.x + labelGutter + d * colWidth,
        y: origin.y + dateBandHeight,
        w: colWidth,
        h: headerHeight - dateBandHeight,
        text: daysJa[d],
      }),
    );
  }

  // 3. 縦線 8 本（曜日列の境界）
  for (let d = 0; d <= 7; d++) {
    const x = origin.x + labelGutter + d * colWidth;
    els.push(
      line({
        id: `grid:vline:${d}`,
        seedSalt: 300 + d,
        x,
        y: origin.y + headerHeight,
        w: 0,
        h: rowHeight * rowsCount,
        points: [
          [0, 0],
          [0, rowHeight * rowsCount],
        ],
        stroke: GRID.colorMajor,
        strokeWidth: 1.5,
      }),
    );
  }

  // 4. 横線（30 分薄線 + 1 時間濃線）
  for (let r = 0; r <= rowsCount; r++) {
    const isMajor = r % 2 === 0;
    const y = origin.y + headerHeight + r * rowHeight;
    els.push(
      line({
        id: `grid:hline:${r}`,
        seedSalt: 400 + r,
        x: origin.x + labelGutter,
        y,
        w: colWidth * 7,
        h: 0,
        points: [
          [0, 0],
          [colWidth * 7, 0],
        ],
        stroke: isMajor ? GRID.colorMajor : GRID.colorMinor,
        strokeWidth: isMajor ? 1.5 : 1,
      }),
    );
  }

  // 5. 時刻ラベル text 16 個（1 時間ごと）
  for (let h = hoursStart; h <= hoursEnd; h++) {
    const r = (h - hoursStart) * 2;
    const y = origin.y + headerHeight + r * rowHeight - rowHeight / 2;
    els.push(
      text({
        id: `grid:timeLabel:${h}`,
        seedSalt: 500 + h,
        x: origin.x,
        y,
        w: labelGutter - 8,
        h: rowHeight,
        text: `${h}:00`,
        align: "right",
      }),
    );
  }

  return els;
}

// 動的メタ情報 (各曜日の日付ラベル) を Excalidraw element として生成する。
// `now` の所属する ISO 8601 週を表示対象とする。customData.kind = GRID_KIND_META で
// マークされ、テンプレとしては保存されず、毎回クライアント側で再生成される。
//
// 年・週番号 ("YYYY年 第N週") は Excalidraw 外のヘッダー UI で表示するためここでは出さない。
export function buildDateOverlayElements(now: Date = new Date()): readonly unknown[] {
  const els: AnyElement[] = [];
  const { origin, labelGutter, colWidth, dateBandHeight } = GRID;

  const monday = getMondayOfWeek(now);

  // 各曜日ヘッダ rect の上半分に日付ラベル。曜日ラベルと同じスタイル (fontSize / 中央寄せ / 同色) に揃える。
  for (let d = 0; d < 7; d++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + d);
    els.push(
      text({
        id: `gridmeta:date:${d}`,
        seedSalt: 700 + d,
        kind: GRID_KIND_META,
        x: origin.x + labelGutter + d * colWidth,
        y: origin.y,
        w: colWidth,
        h: dateBandHeight,
        text: formatMd(date),
        align: "center",
        color: GRID.colorText,
        fontSize: GRID.fontSize,
      }),
    );
  }

  return els;
}

// === フィルタ関数 ========================================================

function elementKind(el: { customData?: unknown } | null | undefined): string | null {
  if (!el || typeof el !== "object") return null;
  const cd = (el as { customData?: { kind?: unknown } }).customData;
  if (!cd || typeof cd !== "object") return null;
  const k = (cd as { kind?: unknown }).kind;
  return typeof k === "string" ? k : null;
}

// frame と meta の両方を「grid 要素」とみなす (=ユーザ要素ではない)
export function isGridElement(el: { customData?: unknown } | null | undefined): boolean {
  const k = elementKind(el);
  return k === GRID_KIND_FRAME || k === GRID_KIND_META;
}

// frame だけを判定 (テンプレ保存対象の判別に使う)
export function isGridFrameElement(el: { customData?: unknown } | null | undefined): boolean {
  return elementKind(el) === GRID_KIND_FRAME;
}

// meta だけを判定 (動的情報の判別に使う)
export function isGridMetaElement(el: { customData?: unknown } | null | undefined): boolean {
  return elementKind(el) === GRID_KIND_META;
}

// frame / meta どちらも除外 (ユーザ要素のみ取り出す)
export function stripGridElements<T extends { customData?: unknown }>(els: readonly T[]): T[] {
  return els.filter((e) => !isGridElement(e));
}
