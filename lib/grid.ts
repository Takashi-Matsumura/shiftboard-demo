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
  headerHeight: 40,
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
  colorMutedText: "#64748b", // slate-500 (日付ラベル)
  colorHeaderBg: "#f1f5f9", // slate-100
  colorSatBg: "#dbeafe", // blue-100
  colorSunBg: "#fee2e2", // red-100
  fontSize: 14,
  fontSizeSmall: 11,
  fontFamilyHelvetica: 5, // Excalidraw の FONT_FAMILY.Helvetica
  // 日付ラベルを曜日セルの右下に配置するためのレイアウト指定
  // Excalidraw の text element は fontSize に対して高さの実描画が伸びるため
  // bounding box を fontSize * lineHeight (1.25) より十分大きく取り、
  // セル下端からの余白も大きめにしてセル枠線と重ならないようにする。
  dateLabelWidth: 40, // text 領域の幅
  dateLabelHeight: 18,
  dateLabelInsetRight: 24, // セル右端からの余白
  dateLabelInsetBottom: 8, // セル下端からの余白
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

  // 2. 曜日ヘッダ text 7 個 (rect 全体に中央寄せ)
  for (let d = 0; d < 7; d++) {
    els.push(
      text({
        id: `grid:headerLabel:${d}`,
        seedSalt: 200 + d,
        x: origin.x + labelGutter + d * colWidth,
        y: origin.y,
        w: colWidth,
        h: headerHeight,
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
  const {
    origin,
    headerHeight,
    labelGutter,
    colWidth,
    dateLabelWidth,
    dateLabelHeight,
    dateLabelInsetRight,
    dateLabelInsetBottom,
  } = GRID;

  const monday = getMondayOfWeek(now);

  // 各曜日ヘッダ rect の右下に日付ラベル「5/4」など。中央の曜日テキストと干渉しないよう
  // 小さめのフォント・控えめな色で右下に寄せる。
  for (let d = 0; d < 7; d++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + d);
    const cellRight = origin.x + labelGutter + (d + 1) * colWidth;
    const cellBottom = origin.y + headerHeight;
    els.push(
      text({
        id: `gridmeta:date:${d}`,
        seedSalt: 700 + d,
        kind: GRID_KIND_META,
        x: cellRight - dateLabelWidth - dateLabelInsetRight,
        y: cellBottom - dateLabelHeight - dateLabelInsetBottom,
        w: dateLabelWidth,
        h: dateLabelHeight,
        text: formatMd(date),
        align: "right",
        color: GRID.colorMutedText,
        fontSize: GRID.fontSizeSmall,
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

// === カード ==============================================================

// スケジュール上に配置する「カード」要素。Shift+Alt+ドラッグで作成され、
// 30 分グリッドにスナップして配置される。ユーザ要素として /api/whiteboard に
// 永続化される (locked: false で移動・削除可)。
export const CARD_KIND = "card-v1";

export type CardColorId = "blue" | "green" | "amber" | "rose" | "violet" | "slate";

export const CARD_COLORS: ReadonlyArray<{
  id: CardColorId;
  label: string;
  fill: string;
  stroke: string;
}> = [
  { id: "blue", label: "青", fill: "#dbeafe", stroke: "#2563eb" },
  { id: "green", label: "緑", fill: "#d1fae5", stroke: "#059669" },
  { id: "amber", label: "黄", fill: "#fef3c7", stroke: "#d97706" },
  { id: "rose", label: "桃", fill: "#ffe4e6", stroke: "#e11d48" },
  { id: "violet", label: "紫", fill: "#ede9fe", stroke: "#7c3aed" },
  { id: "slate", label: "灰", fill: "#e2e8f0", stroke: "#475569" },
];

export const CARD_COLOR_IDS: ReadonlyArray<CardColorId> = CARD_COLORS.map(
  (c) => c.id,
);

export function isCardColorId(value: unknown): value is CardColorId {
  return typeof value === "string" && CARD_COLOR_IDS.includes(value as CardColorId);
}

// 30 分グリッドの原点 (左上のセル左上端)
export function gridOriginXY(): { x: number; y: number } {
  return {
    x: GRID.origin.x + GRID.labelGutter,
    y: GRID.origin.y + GRID.headerHeight,
  };
}

// カードの bounding box (シーン座標) と週オフセットから、
// スケジュールの開始日時 / 終了日時を導出する。
// - 列 (曜日): 月=0 .. 日=6
// - 行: hoursStart からの 30 分単位インデックス
// 列・行とも四捨五入で最寄りの目盛にスナップする。
// 範囲外 (列 < 0 または列 > 6) のときは null。
export function cardBoundsToSchedule(args: {
  card: { x: number; y: number; width: number; height: number };
  weekOffset: number;
  now?: Date;
}): { startAt: Date; endAt: Date } | null {
  const colStart = GRID.origin.x + GRID.labelGutter;
  const rowStart = GRID.origin.y + GRID.headerHeight;

  const startCol = Math.round((args.card.x - colStart) / GRID.colWidth);
  const endCol =
    Math.round((args.card.x + args.card.width - colStart) / GRID.colWidth) - 1;
  const startMin = Math.round((args.card.y - rowStart) / GRID.rowHeight);
  const endMin = Math.round(
    (args.card.y + args.card.height - rowStart) / GRID.rowHeight,
  );

  if (startCol < 0 || startCol > 6 || endCol < 0 || endCol > 6) return null;
  if (startMin < 0 || endMin <= startMin) return null;

  const base = args.now ? new Date(args.now) : new Date();
  base.setDate(base.getDate() + args.weekOffset * 7);
  const monday = getMondayOfWeek(base);

  const startAt = new Date(monday);
  startAt.setDate(startAt.getDate() + startCol);
  startAt.setHours(
    GRID.hoursStart + Math.floor(startMin / 2),
    (startMin % 2) * 30,
    0,
    0,
  );

  const endAt = new Date(monday);
  endAt.setDate(endAt.getDate() + endCol);
  endAt.setHours(
    GRID.hoursStart + Math.floor(endMin / 2),
    (endMin % 2) * 30,
    0,
    0,
  );

  return { startAt, endAt };
}

// シーン座標を 30 分グリッドにスナップ。原点はグリッドの左上端。
export function snapToHalfHourGrid(x: number, y: number): { x: number; y: number } {
  const o = gridOriginXY();
  const sx = Math.round((x - o.x) / GRID.rowHeight) * GRID.rowHeight + o.x;
  const sy = Math.round((y - o.y) / GRID.rowHeight) * GRID.rowHeight + o.y;
  return { x: sx, y: sy };
}

export function isCardElement(el: { customData?: unknown } | null | undefined): boolean {
  return elementKind(el) === CARD_KIND;
}

// カードの中央に表示する「誰が／誰に」のラベル text 要素。
// containerId をカードに紐付けることで Excalidraw が自動的にカード中央に配置する。
export const SCHEDULE_LABEL_KIND = "schedule-label-v1";

export function isScheduleLabelElement(
  el: { customData?: unknown } | null | undefined,
): boolean {
  return elementKind(el) === SCHEDULE_LABEL_KIND;
}

// カード中央のテキストは「顧客名のみ」。担当者は別途 ellipse バッジで表現する。
export function formatScheduleLabel(args: { toWhom: string | null }): string {
  return args.toWhom ?? "";
}

// 「佐藤 次郎」→「佐」、「田中太郎」→「田」、「John Smith」→「J」、未指定 → ""
export function surnameInitial(name: string | null | undefined): string {
  if (!name) return "";
  const head = name.trim().split(/\s+/)[0] ?? "";
  return head[0] ?? "";
}

// 顧客名ラベルの bbox 計算: 単一行の高さでカードの縦中央に配置し、
// 横方向は textAlign:center でカード幅内に中央寄せする。
// containerId 経由の自動配置は updateScene 経路では再計算されないため使わない。
export function scheduleLabelBounds(card: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const lineHeight = 14 * 1.25;
  return {
    x: card.x,
    y: card.y + (card.height - lineHeight) / 2,
    width: card.width,
    height: lineHeight,
  };
}

export function createScheduleLabelElement(args: {
  cardId: string;
  card: { x: number; y: number; width: number; height: number };
  text: string;
}): Record<string, unknown> {
  const id = `lbl:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  const b = scheduleLabelBounds(args.card);
  return {
    id,
    type: "text",
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    angle: 0,
    strokeColor: GRID.colorText,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    groupIds: [args.cardId],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    index: null,
    customData: { kind: SCHEDULE_LABEL_KIND, cardId: args.cardId },
    fontSize: 14,
    fontFamily: GRID.fontFamilyHelvetica,
    text: args.text,
    originalText: args.text,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: null,
    autoResize: false,
    lineHeight: 1.25,
  };
}

// 担当者を表す丸バッジ。ellipse + 中央 1 文字テキストの 2 要素ペア。
// 親カードと同じ groupIds: [cardId] で紐付け、Excalidraw のグループ選択で一緒に動く。
export const SCHEDULE_BADGE_KIND = "schedule-badge-v1";
export const SCHEDULE_BADGE_TEXT_KIND = "schedule-badge-text-v1";

export function isScheduleBadgeElement(
  el: { customData?: unknown } | null | undefined,
): boolean {
  const k = elementKind(el);
  return k === SCHEDULE_BADGE_KIND || k === SCHEDULE_BADGE_TEXT_KIND;
}

const BADGE_DIAMETER = 24;

export function createScheduleBadgeElements(args: {
  cardId: string;
  card: { x: number; y: number };
  color: CardColorId;
  char: string;
}): { ellipse: Record<string, unknown>; text: Record<string, unknown> } {
  const palette = CARD_COLORS.find((c) => c.id === args.color) ?? CARD_COLORS[5];
  const ellipseId = `bdg:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  const textId = `bdgt:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  // 左上の角にバッジ中心を合わせ、半分だけカード外にはみ出させる (FAB 風)。
  // これでカード内のテキストエリアとは重ならない。
  const x = args.card.x - BADGE_DIAMETER / 2;
  const y = args.card.y - BADGE_DIAMETER / 2;
  const ellipse: Record<string, unknown> = {
    id: ellipseId,
    type: "ellipse",
    x,
    y,
    width: BADGE_DIAMETER,
    height: BADGE_DIAMETER,
    angle: 0,
    strokeColor: palette.stroke,
    backgroundColor: palette.fill,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    groupIds: [args.cardId],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    index: null,
    customData: { kind: SCHEDULE_BADGE_KIND, cardId: args.cardId, color: args.color },
  };
  // バッジ text は ellipse 中央に手動配置 (containerId なし)
  const charLineHeight = 14 * 1.25;
  const charBoxWidth = BADGE_DIAMETER;
  const text: Record<string, unknown> = {
    id: textId,
    type: "text",
    x,
    y: y + (BADGE_DIAMETER - charLineHeight) / 2,
    width: charBoxWidth,
    height: charLineHeight,
    angle: 0,
    strokeColor: GRID.colorText,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    groupIds: [args.cardId],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    index: null,
    customData: { kind: SCHEDULE_BADGE_TEXT_KIND, cardId: args.cardId },
    fontSize: 14,
    fontFamily: GRID.fontFamilyHelvetica,
    text: args.char,
    originalText: args.char,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: null,
    autoResize: false,
    lineHeight: 1.25,
  };
  return { ellipse, text };
}

// ドラッグ完了時に、選択された色とスナップ済み座標からカード element を生成する。
// 保存は通常のユーザ要素として onChange → /api/whiteboard で行われるので、
// ここでは特別な処理は要らない。
export function createCardElement(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  colorId: CardColorId;
}): Record<string, unknown> {
  const palette = CARD_COLORS.find((c) => c.id === args.colorId) ?? CARD_COLORS[0];
  const id = `card:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    type: "rectangle",
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    angle: 0,
    strokeColor: palette.stroke,
    backgroundColor: palette.fill,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    // 四隅は正方形にする (角丸なし)
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    index: null,
    customData: { kind: CARD_KIND, color: args.colorId },
  };
}

// frame / meta どちらも除外 (ユーザ要素のみ取り出す)
export function stripGridElements<T extends { customData?: unknown }>(els: readonly T[]): T[] {
  return els.filter((e) => !isGridElement(e));
}
