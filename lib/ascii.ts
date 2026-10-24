/**
 * Image → character grid, on the CPU.
 *
 * Pipeline:  sampleImage()  →  Grid (one luma + colour per cell)
 *            compose()      →  Composed (one character + colour per cell), with user edits applied
 *            render()       →  canvas   |  toText() / toSVG()  →  exports
 *
 * Edits never touch the source grid. They live in Overrides, one slot per cell, so they survive
 * changing the style and can be undone or cleared.
 */

export type ColorMode = "image" | "mono";

export interface Settings {
  /** Characters across. Rows follow from the image aspect and the cell shape. */
  cols: number;
  /** Cell width ÷ cell height. 0.6 for a monospace font, 1 for square glyphs like blocks or dots. */
  aspect: number;
  /** Dark → bright. Usually starts with a space. */
  charset: string;
  gamma: number;
  invert: boolean;
  colorMode: ColorMode;
  fg: string;
  bg: string;
  /** Draw line glyphs along brightness edges. */
  contour: boolean;
  contourT: number;
  /** Dim the ink of darker cells (tonal depth inside one character). */
  shade: boolean;
  /** Cells darker than this are left blank. */
  blankBelow: number;
  /** Glyph size relative to the cell (1 = fills it; <1 leaves gaps, >1 overlaps). */
  glyphScale: number;
  /** Post effects, applied after the glyphs are drawn. */
  glow: number;        // 0..1 additive blur
  scan: number;        // 0..1 scanline darkness
  vignette: boolean;
}

export interface Grid {
  cols: number;
  rows: number;
  /** 0..1 per cell */
  luma: Float32Array;
  /** r,g,b per cell, 0..255 */
  rgb: Uint8ClampedArray;
}

export interface Overrides {
  /** brightness delta per cell, -1..1 */
  luma: Float32Array;
  /** 1 = blank */
  erase: Uint8Array;
  /** explicit character (wins over everything) */
  chars: (string | null)[];
  /** explicit colour */
  color: (string | null)[];
  /** alternate charset for the cell */
  alphabet: (string | null)[];
}

export interface Composed {
  cols: number;
  rows: number;
  chars: string[];
  colors: string[];
}

export const DIR_GLYPHS = ["-", "\\", "|", "/"];
const BLOCK_ALPHA: Record<string, number> = { "░": 0.25, "▒": 0.5, "▓": 0.75, "█": 1 };

export function emptyOverrides(n: number): Overrides {
  return { luma: new Float32Array(n), erase: new Uint8Array(n), chars: new Array(n).fill(null), color: new Array(n).fill(null), alphabet: new Array(n).fill(null) };
}
export function cloneOverrides(o: Overrides): Overrides {
  return { luma: o.luma.slice(), erase: o.erase.slice(), chars: o.chars.slice(), color: o.color.slice(), alphabet: o.alphabet.slice() };
}
export function hasEdits(o: Overrides) {
  for (let i = 0; i < o.erase.length; i++) if (o.erase[i] || o.luma[i] !== 0 || o.chars[i] !== null || o.color[i] !== null || o.alphabet[i] !== null) return true;
  return false;
}

// ─── sampling ────────────────────────────────────────────────────────────────

export type ImageSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement;
const srcSize = (s: ImageSource) => (s instanceof HTMLImageElement ? [s.naturalWidth, s.naturalHeight] : [s.width, s.height]);

export function gridSize(s: ImageSource, cols: number, aspect: number) {
  const [w, h] = srcSize(s);
  return { cols, rows: Math.max(1, Math.round((h / w) * cols * aspect)) };
}

/** Downsample the image to one pixel per cell. Two-step scaling keeps it from aliasing on big photos. */
export function sampleImage(src: ImageSource, cols: number, aspect: number): Grid {
  const { rows } = gridSize(src, cols, aspect);
  const [w, h] = srcSize(src);
  let cur: ImageSource = src, cw = w, ch = h;
  while (cw > cols * 2.5) {
    const nw = Math.max(cols, Math.round(cw / 2)), nh = Math.max(rows, Math.round(ch / 2));
    const c = document.createElement("canvas"); c.width = nw; c.height = nh;
    const x = c.getContext("2d")!; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(cur, 0, 0, nw, nh);
    cur = c; cw = nw; ch = nh;
  }
  const c = document.createElement("canvas"); c.width = cols; c.height = rows;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  x.drawImage(cur, 0, 0, cols, rows);
  const d = x.getImageData(0, 0, cols, rows).data;
  const n = cols * rows, luma = new Float32Array(n), rgb = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3] / 255;
    rgb[i * 3] = r * a; rgb[i * 3 + 1] = g * a; rgb[i * 3 + 2] = b * a;   // transparent → black
    luma[i] = ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * a;
  }
  return { cols, rows, luma, rgb };
}

// ─── composing ───────────────────────────────────────────────────────────────

const splitCache = new Map<string, string[]>();
const chars = (s: string) => { let a = splitCache.get(s); if (!a) { a = [...s]; splitCache.set(s, a); } return a; };
const hex = (r: number, g: number, b: number) => "#" + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Apply settings + overrides to the grid → one character and one colour per cell. */
export function compose(grid: Grid, s: Settings, o: Overrides): Composed {
  const { cols, rows, luma, rgb } = grid, n = cols * rows;
  const l = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = Math.pow(luma[i], s.gamma);
    if (s.invert) v = 1 - v;
    l[i] = clamp01(v + o.luma[i]);
  }
  const base = chars(s.charset);
  const out: string[] = new Array(n), col: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ramp = o.alphabet[i] ? chars(o.alphabet[i]!) : base;
    let ch: string;
    if (o.chars[i] !== null) ch = o.chars[i]!;
    else if (o.erase[i] || l[i] < s.blankBelow) ch = " ";
    else ch = ramp[Math.round(l[i] * (ramp.length - 1))];

    if (s.contour && o.chars[i] === null && !o.erase[i]) {
      const x = i % cols, y = (i / cols) | 0;
      const L = x > 0 ? l[i - 1] : l[i], R = x < cols - 1 ? l[i + 1] : l[i];
      const U = y > 0 ? l[i - cols] : l[i], D = y < rows - 1 ? l[i + cols] : l[i];
      const gx = R - L, gy = D - U;
      if (Math.hypot(gx, gy) > s.contourT) {
        const a = Math.atan2(gx, -gy);
        ch = DIR_GLYPHS[(((Math.floor((a / Math.PI) * 4 + 0.5) % 4) + 4) % 4)];
      }
    }
    out[i] = ch;

    if (o.color[i] !== null) col[i] = o.color[i]!;
    else if (s.colorMode === "mono") col[i] = s.fg;
    else {
      // keep the hue, drop the brightness: the glyph already encodes brightness
      const k = 1 / Math.max(luma[i], 0.02), cap = 255 * 1.6;
      let r = Math.min(rgb[i * 3] * k, cap), g = Math.min(rgb[i * 3 + 1] * k, cap), b = Math.min(rgb[i * 3 + 2] * k, cap);
      const m = s.shade ? 0.55 + 0.55 * l[i] : 1;
      r = Math.min(255, r * m); g = Math.min(255, g * m); b = Math.min(255, b * m);
      col[i] = hex(r, g, b);
    }
    if (s.shade && s.colorMode === "mono" && o.color[i] === null) col[i] = shadeHex(s.fg, s.bg, 0.55 + 0.55 * l[i]);
  }
  return { cols, rows, chars: out, colors: col };
}

const shadeCache = new Map<string, string>();
/** Mix fg toward bg by (1-k). Cached: there are only a few hundred distinct k values after rounding. */
function shadeHex(fg: string, bg: string, k: number) {
  const kk = Math.min(1, Math.max(0, Math.round(k * 64) / 64)), key = fg + bg + kk;
  let v = shadeCache.get(key);
  if (!v) {
    const f = parseInt(fg.slice(1), 16), b = parseInt(bg.slice(1), 16);
    const mix = (sh: number) => ((b >> sh) & 255) + (((f >> sh) & 255) - ((b >> sh) & 255)) * kk;
    v = hex(mix(16), mix(8), mix(0)); shadeCache.set(key, v);
  }
  return v;
}

// ─── rendering ───────────────────────────────────────────────────────────────

/**
 * Either whole-pixel cells (preview: cellW/cellH are rounded, the canvas is cols×cellW by rows×cellH)
 * or an exact output size (export: width/height are the canvas, cells are fractional to fill it).
 */
export interface RenderOpts {
  cellW?: number; cellH?: number; width?: number; height?: number; bg: string; font: string;
  glyphScale?: number; glow?: number; scan?: number; vignette?: boolean;
}
/** Glyphs are drawn semi-bold: thin monospace strokes vanish once cells get small. */
export const GLYPH_WEIGHT = 600;

function drawGlyphs(x: CanvasRenderingContext2D, c: Composed, cellW: number, cellH: number, font: string, glyphScale: number) {
  x.font = `${GLYPH_WEIGHT} ${Math.max(4, Math.round(cellH * 1.02 * glyphScale))}px ${font}`;
  x.textAlign = "center"; x.textBaseline = "middle";
  let last = "";
  for (let i = 0; i < c.chars.length; i++) {
    const ch = c.chars[i];
    if (ch === " ") continue;
    const col = c.colors[i];
    if (col !== last) { x.fillStyle = col; last = col; }
    const px = (i % c.cols) * cellW, py = ((i / c.cols) | 0) * cellH;
    const ba = BLOCK_ALPHA[ch];
    if (ba !== undefined) {
      const inset = (1 - Math.min(1, glyphScale)) / 2;
      x.globalAlpha = ba; x.fillRect(px + cellW * inset, py + cellH * inset, cellW * (1 - inset * 2) + 0.5, cellH * (1 - inset * 2) + 0.5); x.globalAlpha = 1;
    } else x.fillText(ch, px + cellW / 2, py + cellH / 2 + cellH * 0.04);
  }
}

export function render(c: Composed, canvas: HTMLCanvasElement, r: RenderOpts) {
  let W: number, H: number, cellW: number, cellH: number;
  if (r.width && r.height) { W = Math.round(r.width); H = Math.round(r.height); cellW = W / c.cols; cellH = H / c.rows; }
  else { cellW = Math.max(1, Math.round(r.cellW!)); cellH = Math.max(1, Math.round(r.cellH!)); W = c.cols * cellW; H = c.rows * cellH; }
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const x = canvas.getContext("2d")!;
  const glyphScale = r.glyphScale ?? 1, glow = r.glow ?? 0, scan = r.scan ?? 0;
  x.fillStyle = r.bg; x.fillRect(0, 0, W, H);

  if (glow > 0) {
    // glyphs on a transparent layer, drawn once blurred and added (the glow), then once sharp on top
    const layer = document.createElement("canvas"); layer.width = W; layer.height = H;
    drawGlyphs(layer.getContext("2d")!, c, cellW, cellH, r.font, glyphScale);
    x.save();
    x.globalCompositeOperation = "lighter"; x.globalAlpha = Math.min(1, glow);
    x.filter = `blur(${Math.max(2, cellH * 0.7).toFixed(1)}px)`;
    x.drawImage(layer, 0, 0);
    x.restore();
    x.drawImage(layer, 0, 0);
  } else drawGlyphs(x, c, cellW, cellH, r.font, glyphScale);

  if (scan > 0) {
    // dark lines, two per character row, like a CRT raster
    const pitch = Math.max(2, Math.round(cellH / 2)), thick = Math.max(1, Math.round(pitch / 2));
    x.fillStyle = `rgba(0,0,0,${scan})`;
    for (let y = 0; y < H; y += pitch) x.fillRect(0, y, W, thick);
  }
  if (r.vignette) {
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.7)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
}

// ─── exports ─────────────────────────────────────────────────────────────────

export function toText(c: Composed) {
  const lines: string[] = [];
  for (let y = 0; y < c.rows; y++) lines.push(c.chars.slice(y * c.cols, (y + 1) * c.cols).join("").replace(/\s+$/, ""));
  return lines.join("\n");
}

/** Apply edited text back as character overrides. Lines are clipped/padded to the grid. */
export function applyText(text: string, c: Composed, o: Overrides) {
  const lines = text.split("\n");
  for (let y = 0; y < c.rows; y++) {
    const line = chars(lines[y] ?? "");
    for (let x = 0; x < c.cols; x++) {
      const i = y * c.cols + x, ch = line[x] ?? " ";
      if (ch !== c.chars[i]) o.chars[i] = ch;
    }
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** SVG at an exact size (width/height) or at cellH per row with the settings' cell shape. */
export function toSVG(c: Composed, s: Settings, size?: { width: number; height: number }, cellHIn = 16) {
  const cellW = size ? size.width / c.cols : cellHIn * s.aspect, cellH = size ? size.height / c.rows : cellHIn;
  const W = size ? size.width : c.cols * cellW, H = size ? size.height : c.rows * cellH, fs = cellH * 0.92 * (s.glyphScale || 1);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Geist Mono, ui-monospace, Menlo, Consolas, monospace" font-size="${fs}" font-weight="${GLYPH_WEIGHT}" text-anchor="middle">`,
    `<rect width="100%" height="100%" fill="${s.bg}"/>`,
  ];
  for (let y = 0; y < c.rows; y++) {
    const cy = (y * cellH + cellH * 0.54).toFixed(1);
    const row: string[] = [];
    for (let x = 0; x < c.cols; x++) {
      const i = y * c.cols + x, ch = c.chars[i];
      if (ch === " ") continue;
      const cx = (x * cellW + cellW / 2).toFixed(1);
      if (BLOCK_ALPHA[ch] !== undefined) parts.push(`<rect x="${(x * cellW).toFixed(1)}" y="${y * cellH}" width="${cellW.toFixed(1)}" height="${cellH}" fill="${c.colors[i]}" fill-opacity="${BLOCK_ALPHA[ch]}"/>`);
      else row.push(`<tspan x="${cx}" fill="${c.colors[i]}">${esc(ch)}</tspan>`);
    }
    if (row.length) parts.push(`<text y="${cy}">${row.join("")}</text>`);
  }
  parts.push("</svg>");
  return parts.join("\n");
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── alphabet from any text ──────────────────────────────────────────────────

const inkCache = new Map<string, number>();
/** How much ink a character has, 0..1, measured by drawing it. Client only. */
export function inkDensity(ch: string, font = "monospace") {
  const key = ch + font;
  const cached = inkCache.get(key);
  if (cached !== undefined) return cached;
  if (BLOCK_ALPHA[ch] !== undefined) { inkCache.set(key, BLOCK_ALPHA[ch]); return BLOCK_ALPHA[ch]; }
  const cv = document.createElement("canvas"); cv.width = 32; cv.height = 48;
  const x = cv.getContext("2d", { willReadFrequently: true })!;
  x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `${GLYPH_WEIGHT} 40px ${font}`;
  x.fillText(ch, 16, 26);
  const d = x.getImageData(0, 0, 32, 48).data; let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i];
  const v = sum / (255 * 32 * 48);
  inkCache.set(key, v); return v;
}
/** "KRISH" → " ISKHR": unique characters sorted by ink, space first. */
export function rampFromText(text: string, font?: string) {
  const uniq = [...new Set([...text])].filter((c) => c.trim() !== "");
  uniq.sort((a, b) => inkDensity(a, font) - inkDensity(b, font));
  return " " + uniq.join("");
}
