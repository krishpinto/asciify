import type { Settings } from "./ascii";

export const CHARSETS = {
  classic: " .:-=+*#%@",
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  minimal: " .:*#",
  blocks: " ░▒▓█",
  bars: " ▁▂▃▄▅▆▇█",
  dots: " ·•●",
  braille: " ⠁⠃⠇⠏⠟⠿⡿⣿",
  binary: " 01",
  katakana: " ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789",
  flowers: " .·*✿❀✾",
  hearts: " .·♡♥",
  math: " .:∴∵≡≈∞Σ∏∫∂∇",
} as const;

export const DEFAULTS: Settings = {
  cols: 120,
  aspect: 0.6,
  charset: CHARSETS.classic,
  gamma: 1,
  invert: false,
  colorMode: "image",
  fg: "#f2f2f2",
  bg: "#0c0c0e",
  contour: false,
  contourT: 0.12,
  shade: true,
  blankBelow: 0.06,
  glyphScale: 1,
  glow: 0,
  scan: 0,
  vignette: false,
};

/** Where the result is going. Exact output pixels; the crop follows the aspect, the column count follows the size. */
export type Target = { id: string; name: string; w: number; h: number; hint: string };
export const TARGETS: Target[] = [
  { id: "free", name: "Free", w: 0, h: 0, hint: "keeps the image's own shape" },
  { id: "phone", name: "Phone wallpaper", w: 1170, h: 2532, hint: "1170 × 2532" },
  { id: "desktop", name: "Desktop wallpaper", w: 2560, h: 1440, hint: "2560 × 1440" },
  { id: "square", name: "Square post", w: 1080, h: 1080, hint: "1080 × 1080" },
  { id: "portrait", name: "Portrait post", w: 1080, h: 1350, hint: "1080 × 1350" },
  { id: "story", name: "Story", w: 1080, h: 1920, hint: "1080 × 1920" },
  { id: "header", name: "X header", w: 1500, h: 500, hint: "1500 × 500" },
  { id: "custom", name: "Custom", w: 0, h: 0, hint: "any size" },
];

/** Detail = how many character rows the output gets. Fewer rows → bigger, bolder characters. */
export const DETAIL = { bold: 55, normal: 85, fine: 125 } as const;
export type Detail = keyof typeof DETAIL;

/** Columns that give `rows` character rows across an output of w×h with the given cell shape. */
export function colsFor(w: number, h: number, cellAspect: number, rows: number) {
  const cellH = h / rows;
  return Math.min(320, Math.max(40, Math.round(w / (cellH * cellAspect) / 4) * 4));
}

export type Preset = {
  name: string; hint: string; settings: Partial<Settings>;
  /** The charset isn't in ink order (e.g. katakana): sort it by measured ink when applied. */
  sortByInk?: boolean;
};

/** A preset is a bag of settings on top of DEFAULTS. Keep this list short: it is the whole style UI. */
export const PRESETS: Preset[] = [
  { name: "Classic", hint: "the ramp everyone knows", settings: { charset: CHARSETS.classic, aspect: 0.6, colorMode: "image" } },
  { name: "Dense", hint: "70 characters, photo detail", settings: { charset: CHARSETS.dense, aspect: 0.55, colorMode: "image", gamma: 0.9 } },
  { name: "Minimal", hint: "five characters", settings: { charset: CHARSETS.minimal, aspect: 0.6, colorMode: "image" } },
  { name: "Blocks", hint: "pixel-art shading", settings: { charset: CHARSETS.blocks, aspect: 1, colorMode: "image" } },
  { name: "Bars", hint: "bar-chart shading", settings: { charset: CHARSETS.bars, aspect: 0.6, colorMode: "image" } },
  { name: "Dots", hint: "halftone", settings: { charset: CHARSETS.dots, aspect: 1, colorMode: "image", gamma: 0.8 } },
  { name: "Braille", hint: "fine dots", settings: { charset: CHARSETS.braille, aspect: 0.6, colorMode: "mono", fg: "#e8e8ff", bg: "#06060a", gamma: 1.2 } },
  { name: "Terminal", hint: "green phosphor, glow and scanlines", settings: { charset: CHARSETS.classic, aspect: 0.6, colorMode: "mono", fg: "#39ff14", bg: "#02110a", gamma: 1.1, glow: 0.5, scan: 0.25 } },
  { name: "Amber", hint: "old CRT", settings: { charset: CHARSETS.dense, aspect: 0.6, colorMode: "mono", fg: "#ffb000", bg: "#160c00", glow: 0.35, scan: 0.3, vignette: true } },
  { name: "Matrix", hint: "katakana rain, frozen", settings: { charset: CHARSETS.katakana, aspect: 0.7, colorMode: "mono", fg: "#00ff6a", bg: "#000000", glow: 0.4 }, sortByInk: true },
  { name: "Paper", hint: "ink on cream", settings: { charset: CHARSETS.classic, aspect: 0.6, colorMode: "mono", fg: "#2b2419", bg: "#f4ecd8", invert: true, shade: false, blankBelow: 0.03 } },
  { name: "Negative", hint: "light where it's dark", settings: { charset: CHARSETS.classic, aspect: 0.6, colorMode: "mono", fg: "#ffffff", bg: "#000000", invert: true, shade: false } },
  { name: "Contour", hint: "line art on edges", settings: { charset: CHARSETS.dots, aspect: 0.6, colorMode: "mono", fg: "#ffffff", bg: "#000000", contour: true, contourT: 0.1, shade: false } },
  { name: "Binary", hint: "ones and zeros", settings: { charset: CHARSETS.binary, aspect: 0.6, colorMode: "mono", fg: "#4fd1ff", bg: "#000810", glow: 0.3 } },
  { name: "Flowers", hint: "✿ ❀ ✾", settings: { charset: CHARSETS.flowers, aspect: 1, colorMode: "image", gamma: 0.9 }, sortByInk: true },
  { name: "Hearts", hint: "♡ ♥", settings: { charset: CHARSETS.hearts, aspect: 1, colorMode: "image", gamma: 0.9 }, sortByInk: true },
  { name: "Math", hint: "∑ ∫ ∞", settings: { charset: CHARSETS.math, aspect: 0.8, colorMode: "image" }, sortByInk: true },
];
