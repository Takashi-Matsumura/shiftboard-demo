// 訪問介護ヘルパーステーション用の週間スケジュール枠を Excalidraw element として生成する。
// 枠は DB に保存しない方針で、クライアント側で毎回 buildGridElements() を呼んで inject する。
// 全 element は locked: true で動かせず、customData.kind = GRID_KIND でユーザ要素と区別する。

export const GRID_KIND = "grid-v1";

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
  colorHeaderBg: "#f1f5f9", // slate-100
  colorSatBg: "#dbeafe", // blue-100
  colorSunBg: "#fee2e2", // red-100
  fontSize: 14,
  fontFamilyHelvetica: 5, // Excalidraw の FONT_FAMILY.Helvetica
} as const;

type AnyElement = Record<string, unknown>;

function commonBase(id: string, seedSalt: number): AnyElement {
  return {
    id,
    locked: true,
    customData: { kind: GRID_KIND },
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
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  stroke: string;
  strokeWidth?: number;
}): AnyElement {
  return {
    ...commonBase(args.id, args.seedSalt),
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
  x: number;
  y: number;
  w: number;
  h: number;
  points: [number, number][];
  stroke: string;
  strokeWidth: number;
}): AnyElement {
  return {
    ...commonBase(args.id, args.seedSalt),
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
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  align?: "left" | "center" | "right";
  color?: string;
}): AnyElement {
  const align = args.align ?? "center";
  return {
    ...commonBase(args.id, args.seedSalt),
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
    fontSize: GRID.fontSize,
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

export function buildGridElements(): readonly unknown[] {
  const els: AnyElement[] = [];
  const { origin, headerHeight, labelGutter, colWidth, rowHeight, hoursStart, hoursEnd, daysJa } = GRID;

  const rowsCount = (hoursEnd - hoursStart) * 2; // 30 分行数（端点除く）
  const totalWidth = labelGutter + colWidth * 7;
  const totalHeight = headerHeight + rowHeight * rowsCount;

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

  // 2. 曜日ヘッダ text 7 個
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

  // 3. 縦線 8 本（曜日列の境界、月の左 〜 日の右）
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
  // 端点も含めて (rowsCount + 1) 本。ただし 0 の線はヘッダ rectangle の下端と重なるので skip 可。
  // ただし整合性のため最上端と最下端も major 線として明示的に引く。
  for (let r = 0; r <= rowsCount; r++) {
    const isMajor = r % 2 === 0; // 1 時間ごと
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
  // 各 1 時間線 (r = 0, 2, 4, ..., rowsCount) の左ガターに右寄せで描く
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

  // totalWidth / totalHeight は将来の拡張用。現在は debug のため変数化のみ。
  void totalWidth;
  void totalHeight;

  return els;
}

export function isGridElement(el: { customData?: unknown } | null | undefined): boolean {
  if (!el || typeof el !== "object") return false;
  const cd = (el as { customData?: { kind?: unknown } }).customData;
  return !!cd && cd.kind === GRID_KIND;
}

export function stripGridElements<T extends { customData?: unknown }>(els: readonly T[]): T[] {
  return els.filter((e) => !isGridElement(e));
}
