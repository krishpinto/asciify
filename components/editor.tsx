"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALargeSmall, Brush, Check, ChevronDown, Copy, Crop, Download, Eraser, FileCode2, FileImage, FileText, Moon, Paintbrush, RotateCcw, SlidersHorizontal, Sun, Type, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { applyText, cloneOverrides, compose, download, emptyOverrides, hasEdits, rampFromText, render, sampleImage, toSVG, toText, type Overrides, type Settings } from "@/lib/ascii";
import { colsFor, DEFAULTS, DETAIL, PRESETS, TARGETS, type Detail } from "@/lib/presets";
import { Button, Chip, Field, Segmented, Slider, TextInput, Toggle } from "./ui";
import { Logo } from "./logo";
import { CropOverlay, cropToCanvas, fitRatio, fullRect, type Rect } from "./crop";

type Tool = "none" | "erase" | "restore" | "lighter" | "darker" | "alphabet" | "color" | "char";
const TOOLS: { id: Tool; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { id: "erase", label: "Erase", icon: Eraser, hint: "blank out cells" },
  { id: "restore", label: "Restore", icon: RotateCcw, hint: "undo edits under the brush" },
  { id: "lighter", label: "Lighter", icon: Sun, hint: "more ink" },
  { id: "darker", label: "Darker", icon: Moon, hint: "less ink" },
  { id: "alphabet", label: "Alphabet", icon: ALargeSmall, hint: "paint a different character set" },
  { id: "color", label: "Colour", icon: Paintbrush, hint: "paint a colour" },
  { id: "char", label: "Stamp", icon: Type, hint: "paint one character" },
];
const UNDO_MAX = 40;
const STAGE_PAD = 12;     // px inside the stage border

type Scale = "1" | "2" | "4";
function Row({ icon: Icon, title, hint, onClick, children }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string; onClick: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-muted">
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1"><span className="block text-sm">{title}</span><span className="block truncate font-mono text-[11px] text-muted-foreground">{hint}</span></span>
      </button>
      {children}
    </div>
  );
}
/** The one export control: a button that opens PNG (with size), SVG and Text. Used top-right and at the bottom of the panel. */
function ExportMenu({ scale, setScale, fixed, pngSize, onPNG, onSVG, onTXT, up, size = "md", className }: {
  scale: Scale; setScale: (s: Scale) => void; fixed: boolean; pngSize: string;
  onPNG: () => void; onSVG: () => void; onTXT: () => void; up?: boolean; size?: "sm" | "md" | "lg"; className?: string;
}) {
  // The menu is fixed to the viewport (anchored to the button's rect) so a scrolling panel can't clip it.
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const open = pos !== null;
  const root = useRef<HTMLDivElement>(null);
  const toggle = () => {
    if (open) return setPos(null);
    const r = root.current!.getBoundingClientRect();
    setPos(up ? { right: innerWidth - r.right, bottom: innerHeight - r.top + 8 } : { right: innerWidth - r.right, top: r.bottom + 8 });
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!root.current?.contains(e.target as Node)) setPos(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null); };
    const away = () => setPos(null);
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", esc);
    window.addEventListener("scroll", away, true); window.addEventListener("resize", away);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); window.removeEventListener("scroll", away, true); window.removeEventListener("resize", away); };
  }, [open]);
  const pick = (fn: () => void) => { fn(); setPos(null); };
  return (
    <div ref={root} className={cn("relative", className)}>
      <Button variant="brand" size={size} onClick={toggle} aria-expanded={open} className="w-full"><Download />Export<ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} /></Button>
      {open && (
        <div style={pos} className="fixed z-50 w-72 rounded-xl border border-border bg-card p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,.8)]">
          <Row icon={FileImage} title="PNG" hint={pngSize} onClick={() => pick(onPNG)}>
            {!fixed && (
              <div className="flex rounded-md border border-border p-0.5" onClick={(e) => e.stopPropagation()}>
                {(["1", "2", "4"] as Scale[]).map((v) => (
                  <button key={v} onClick={() => setScale(v)} aria-pressed={scale === v} className={cn("rounded px-1.5 text-[11px] font-mono transition", scale === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{v}×</button>
                ))}
              </div>
            )}
          </Row>
          <Row icon={FileCode2} title="SVG" hint="vector · scales to any size" onClick={() => pick(onSVG)} />
          <Row icon={FileText} title="Text file" hint="plain .txt, paste it anywhere" onClick={() => pick(onTXT)} />
          <p className="px-2.5 pb-1.5 pt-2 text-[11px] leading-snug text-muted-foreground/80">Going somewhere small, like an avatar? Sites shrink the image and thin characters turn to mush. Crop to the face, pick bold detail, then export.</p>
        </div>
      )}
    </div>
  );
}

export function Editor({ img, name, onReset }: { img: HTMLImageElement; name: string; onReset: () => void }) {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [preset, setPreset] = useState(PRESETS[0].name);
  const [alphabet, setAlphabet] = useState("");
  const [tool, setTool] = useState<Tool>("none");
  const [brushSize, setBrushSize] = useState(3);
  const [brushAlphabet, setBrushAlphabet] = useState(" .:*#");
  const [brushColor, setBrushColor] = useState("#ffb000");
  const [brushChar, setBrushChar] = useState("@");
  const [textMode, setTextMode] = useState(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [cropping, setCropping] = useState(false);
  const [target, setTarget] = useState("free");
  const [custom, setCustom] = useState({ w: img.naturalWidth, h: img.naturalHeight });
  const [detail, setDetail] = useState<Detail>("normal");
  const [advanced, setAdvanced] = useState(false);
  const [scale, setScale] = useState<Scale>("2");
  const [copied, setCopied] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const fontRef = useRef("monospace");
  const [fontReady, setFontReady] = useState(false);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0, twoCol: true });
  const colsAuto = useRef(true);

  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));

  // ── output target ─────────────────────────────────────────────────────────
  const tgt = TARGETS.find((t) => t.id === target)!;
  const out = target === "free" ? null : target === "custom" ? { w: Math.max(64, custom.w | 0), h: Math.max(64, custom.h | 0) } : { w: tgt.w, h: tgt.h };
  const lock = out ? { ratio: out.w / out.h, label: tgt.name.toLowerCase() } : null;
  /** A target decides the crop aspect and how many columns give readable characters at that size. */
  function applyTarget(id: string, size: { w: number; h: number } | null, det = detail, cropNow = crop) {
    setTarget(id);
    if (!size) return;
    const ratio = size.w / size.h;
    let r: Rect;
    if (cropNow && Math.abs(cropNow.w / cropNow.h - ratio) < 0.005) r = cropNow;          // already that shape: keep it
    else {
      // largest rect of the new shape in the whole image, centred where the previous crop was
      r = fitRatio(fullRect(img), ratio, img);
      if (cropNow) {
        const cx = cropNow.x + cropNow.w / 2, cy = cropNow.y + cropNow.h / 2;
        r = { ...r, x: Math.min(Math.max(cx - r.w / 2, 0), img.naturalWidth - r.w), y: Math.min(Math.max(cy - r.h / 2, 0), img.naturalHeight - r.h) };
      }
    }
    setCrop(r.x <= 0 && r.y <= 0 && r.w >= img.naturalWidth && r.h >= img.naturalHeight ? null : { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
    setS((p) => ({ ...p, cols: colsFor(size.w, size.h, p.aspect, DETAIL[det]) }));
    colsAuto.current = false;
  }
  function pickTarget(id: string) {
    const t = TARGETS.find((t) => t.id === id)!;
    applyTarget(id, id === "free" ? null : id === "custom" ? custom : { w: t.w, h: t.h });
  }
  function pickDetail(d: Detail) {
    setDetail(d);
    if (out) setS((p) => ({ ...p, cols: colsFor(out.w, out.h, p.aspect, DETAIL[d]) }));
    else if (stageSize.w) setS((p) => ({ ...p, cols: Math.min(320, Math.max(40, Math.round(DETAIL[d] * 2.2 / 4) * 4)) }));
  }
  function setCustomSize(c: { w: number; h: number }) { setCustom(c); if (target === "custom" && c.w >= 64 && c.h >= 64) applyTarget("custom", c); }

  // the font Next loaded for --font-geist-mono, so the canvas matches the page
  useEffect(() => {
    const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim();
    fontRef.current = fam ? `${fam}, ui-monospace, Menlo, Consolas, monospace` : "ui-monospace, Menlo, Consolas, monospace";
    document.fonts.load(`16px ${fontRef.current}`).finally(() => setFontReady(true));
  }, []);

  // the canvas is sized to the stage so every cell lands on whole device pixels (no blurry downscale)
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const twoCol = window.matchMedia("(min-width: 1024px)").matches;
      setStageSize({ w: e.contentRect.width, h: e.contentRect.height, twoCol });
      // first measurement, free mode: pick a width that gives 5px-wide cells on this screen
      if (colsAuto.current && e.contentRect.width > 0) {
        colsAuto.current = false;
        setS((p) => ({ ...p, cols: Math.min(320, Math.max(40, Math.floor((e.contentRect.width - STAGE_PAD * 2) / 5 / 4) * 4)) }));
      }
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // ── grid + edits ──────────────────────────────────────────────────────────
  // the source is the crop if there is one; everything after this line never knows the difference
  const src = useMemo(() => (crop ? cropToCanvas(img, crop) : img), [img, crop]);
  const grid = useMemo(() => sampleImage(src, s.cols, s.aspect), [src, s.cols, s.aspect]);
  const n = grid.cols * grid.rows;
  // Overrides are cloned on every edit (typed arrays, cheap) so React sees a new value and undo is trivial.
  const [ovState, setOv] = useState<Overrides>(() => emptyOverrides(n));
  const ov = ovState.erase.length === n ? ovState : emptyOverrides(n);   // a size change (new cols) drops edits
  const undo = useRef<Overrides[]>([]);
  const edit = (mutate: (o: Overrides) => void) =>
    setOv((prev) => { const o = cloneOverrides(prev.erase.length === n ? prev : emptyOverrides(n)); mutate(o); return o; });

  const composed = useMemo(() => compose(grid, s, ov), [grid, s, ov]);
  const edited = useMemo(() => hasEdits(ov), [ov]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !fontReady || !stageSize.w) return;
    const dpr = window.devicePixelRatio || 1;
    const availW = (stageSize.w - STAGE_PAD * 2) * dpr, availH = Math.max(200, stageSize.h - STAGE_PAD * 2) * dpr;
    // The picture always fills the stage (contain-fit), whatever the column count: columns change detail, not size.
    // Cells are rendered at the next whole device pixel above the exact fit, then scaled down by at most a few % in CSS.
    const byW = availW / composed.cols, byH = (availH / composed.rows) * s.aspect;
    const fit = stageSize.twoCol ? Math.min(byW, byH) : byW;
    const cellW = Math.max(2, Math.ceil(fit));
    const cellH = Math.max(2, Math.round(cellW / s.aspect));
    render(composed, cv, { cellW, cellH, bg: s.bg, font: fontRef.current, glyphScale: s.glyphScale, glow: s.glow, scan: s.scan, vignette: s.vignette });
    const k = Math.min(1, fit / cellW) / dpr;
    cv.style.width = `${cv.width * k}px`; cv.style.height = `${cv.height * k}px`;
  }, [composed, s.aspect, s.bg, s.glyphScale, s.glow, s.scan, s.vignette, fontReady, stageSize]);

  const snapshot = () => { undo.current.push(cloneOverrides(ov)); if (undo.current.length > UNDO_MAX) undo.current.shift(); };
  const doUndo = useCallback(() => { const o = undo.current.pop(); if (o && o.erase.length === n) setOv(o); }, [n]);
  const clearEdits = () => { snapshot(); setOv(emptyOverrides(n)); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); doUndo(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [doUndo]);

  // ── presets + alphabet ────────────────────────────────────────────────────
  function pickPreset(nm: string) {
    const p = PRESETS.find((p) => p.name === nm)!;
    setPreset(nm);
    setS((prev) => {
      const next = { ...DEFAULTS, ...p.settings, cols: prev.cols };
      if (p.sortByInk) next.charset = rampFromText(next.charset, fontRef.current);
      if (alphabet.trim()) next.charset = rampFromText(alphabet, fontRef.current);
      if (out && next.aspect !== prev.aspect) next.cols = colsFor(out.w, out.h, next.aspect, DETAIL[detail]);   // cell shape changed → keep rows
      return next;
    });
  }
  function changeAlphabet(t: string) {
    setAlphabet(t);
    const p = PRESETS.find((p) => p.name === preset)!;
    const base = p.settings.charset ?? DEFAULTS.charset;
    set({ charset: t.trim() ? rampFromText(t, fontRef.current) : p.sortByInk ? rampFromText(base, fontRef.current) : base });
  }
  const post = { glyphScale: s.glyphScale, glow: s.glow, scan: s.scan, vignette: s.vignette };
  function setAspect(a: number) {
    setS((p) => ({ ...p, aspect: a, cols: out ? colsFor(out.w, out.h, a, DETAIL[detail]) : p.cols }));
  }

  // ── brushes ───────────────────────────────────────────────────────────────
  const stroke = useRef<{ touched: Set<number> } | null>(null);
  function cellAt(e: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * grid.cols, y: ((e.clientY - r.top) / r.height) * grid.rows };
  }
  function stamp(cx: number, cy: number) {
    const R = brushSize, touched = stroke.current!.touched, cells: number[] = [];
    const x0 = Math.max(0, Math.floor(cx - R / s.aspect)), x1 = Math.min(grid.cols - 1, Math.ceil(cx + R / s.aspect));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(grid.rows - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) * s.aspect, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > R * R) continue;
      const i = y * grid.cols + x;
      if (touched.has(i)) continue; touched.add(i); cells.push(i);
    }
    if (!cells.length) return;
    edit((o) => {
      for (const i of cells) switch (tool) {
        case "erase": o.erase[i] = 1; break;
        case "restore": o.erase[i] = 0; o.luma[i] = 0; o.chars[i] = null; o.color[i] = null; o.alphabet[i] = null; break;
        case "lighter": o.luma[i] = Math.min(1, o.luma[i] + 0.12); o.erase[i] = 0; break;
        case "darker": o.luma[i] = Math.max(-1, o.luma[i] - 0.12); break;
        case "alphabet": o.alphabet[i] = brushAlphabet.length >= 2 ? brushAlphabet : null; o.erase[i] = 0; break;
        case "color": o.color[i] = brushColor; break;
        case "char": o.chars[i] = [...brushChar][0] ?? "@"; o.erase[i] = 0; break;
      }
    });
  }
  const onDown = (e: React.PointerEvent) => { if (tool === "none") return; e.currentTarget.setPointerCapture(e.pointerId); snapshot(); stroke.current = { touched: new Set() }; const c = cellAt(e); stamp(c.x, c.y); };
  const onMove = (e: React.PointerEvent) => {
    if (cursor.current && stage.current) {
      const r = canvas.current!.getBoundingClientRect(), st = stage.current.getBoundingClientRect();
      const d = (brushSize * 2 * r.height) / grid.rows;
      cursor.current.style.transform = `translate(${e.clientX - st.left - d / 2}px, ${e.clientY - st.top - d / 2}px)`;
      cursor.current.style.width = cursor.current.style.height = `${d}px`;
    }
    if (stroke.current) { const c = cellAt(e); stamp(c.x, c.y); }
  };
  const onUp = () => { stroke.current = null; };

  // ── text mode ─────────────────────────────────────────────────────────────
  const text = useMemo(() => toText(composed), [composed]);
  const textDirty = useRef(false);
  function onText(v: string) {
    if (!textDirty.current) { snapshot(); textDirty.current = true; }
    edit((o) => applyText(v, composed, o));
  }

  // ── exports ───────────────────────────────────────────────────────────────
  const exportSize = out ?? { w: grid.cols * Math.round(16 * +scale * s.aspect), h: grid.rows * 16 * +scale };
  async function savePNG() {
    const c = document.createElement("canvas");
    if (out) render(composed, c, { width: out.w, height: out.h, bg: s.bg, font: fontRef.current, ...post });
    else { const cellH = 16 * +scale; render(composed, c, { cellW: Math.round(cellH * s.aspect), cellH, bg: s.bg, font: fontRef.current, ...post }); }
    c.toBlob((b) => b && download(b, `${name}-${target === "free" ? "ascii" : target}.png`), "image/png");
  }
  const saveSVG = () => download(new Blob([toSVG(composed, s, out ? { width: out.w, height: out.h } : undefined)], { type: "image/svg+xml" }), `${name}-ascii.svg`);
  const saveTXT = () => download(new Blob([text], { type: "text/plain" }), `${name}-ascii.txt`);
  async function copyText() {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  const cellsLabel = `${grid.cols} × ${grid.rows} · ${(grid.cols * grid.rows).toLocaleString()} characters`;
  const pngSize = `${exportSize.w} × ${exportSize.h} px${out ? ` · ${tgt.name.toLowerCase()}` : ""}`;
  const exportProps = { scale, setScale, fixed: !!out, pngSize, onPNG: savePNG, onSVG: saveSVG, onTXT: saveTXT };
  const toolBtn = "flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] transition-colors";
  const toolOn = "border-foreground bg-foreground text-background", toolOff = "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <button onClick={onReset} className="flex items-center"><Logo /></button>
        <div className="flex items-center gap-2">
          {edited && <Button size="sm" variant="ghost" onClick={doUndo} title="Undo (Ctrl+Z)"><Undo2 />Undo</Button>}
          <Button size="sm" variant={crop ? "outline" : "ghost"} onClick={() => { setCropping(true); setTool("none"); setTextMode(false); }} title="crop the source image"><Crop />{crop ? "Cropped" : "Crop"}</Button>
          <Button size="sm" variant="ghost" onClick={onReset}><X />New image</Button>
          <ExportMenu {...exportProps} size="sm" />
        </div>
      </header>

      <div className="grid flex-1 gap-5 p-4 lg:h-[calc(100vh-3rem)] lg:flex-none lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:p-5">
        {/* ── stage ── */}
        <section className="flex min-w-0 flex-col gap-2 lg:min-h-0">
          <div ref={stage} className={cn("relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-card/40", tool !== "none" && !textMode && !cropping && "cursor-none")}
            style={{ minHeight: 320, padding: STAGE_PAD }}>
            {cropping ? (
              <CropOverlay img={img} value={crop} lock={lock} onCancel={() => setCropping(false)} onApply={(r) => { setCrop(r); setCropping(false); }} />
            ) : textMode ? (
              <textarea value={text} onChange={(e) => onText(e.target.value)} onBlur={() => (textDirty.current = false)} spellCheck={false} wrap="off"
                className="h-full min-h-[60vh] w-full resize-none rounded-lg border border-input p-3 font-mono text-[11px] leading-[1.15] tracking-normal outline-none focus:border-ring"
                style={{ background: s.bg, color: s.colorMode === "mono" ? s.fg : "#ddd" }} />
            ) : (
              <>
                <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp} className="touch-none rounded-md" />
                {tool !== "none" && <div ref={cursor} className="pointer-events-none absolute left-0 top-0 rounded-full border border-brand/90 mix-blend-difference" />}
              </>
            )}
          </div>
          <div className="flex items-center justify-between px-1 font-mono text-[11px] text-muted-foreground">
            <span>{cellsLabel}{out && ` · exports ${out.w} × ${out.h}`}</span>
            <span>{cropping ? "drag on the photo · Enter applies, Esc cancels" : textMode ? "editing as text" : tool === "none" ? "pick a brush to edit" : `${TOOLS.find((t) => t.id === tool)!.label.toLowerCase()} · ${brushSize}`}{edited && " · edited"}</span>
          </div>
        </section>

        {/* ── panel ── */}
        <aside className="flex flex-col gap-7 lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:pb-6">
          <Field label="Make it for" value={out ? `${out.w} × ${out.h}` : "any size"}>
            <div className="flex flex-wrap gap-1.5">
              {TARGETS.map((t) => <Chip key={t.id} on={t.id === target} onClick={() => pickTarget(t.id)} title={t.hint}>{t.name}</Chip>)}
            </div>
            {target === "custom" && (
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <TextInput type="number" min={64} max={8192} value={custom.w} onChange={(e) => setCustomSize({ ...custom, w: +e.target.value })} className="w-24 font-mono" aria-label="width" />×
                <TextInput type="number" min={64} max={8192} value={custom.h} onChange={(e) => setCustomSize({ ...custom, h: +e.target.value })} className="w-24 font-mono" aria-label="height" />px
              </div>
            )}
            <Field label="Detail" value={`${grid.rows} rows`} className="mt-1">
              <Segmented value={detail} onChange={pickDetail} options={[{ value: "bold", label: "bold" }, { value: "normal", label: "normal" }, { value: "fine", label: "fine" }]} />
            </Field>
          </Field>

          <Field label="Style">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => <Chip key={p.name} on={p.name === preset} onClick={() => pickPreset(p.name)} title={p.hint}>{p.name}</Chip>)}
            </div>
          </Field>

          <Field label="Alphabet" value={alphabet.trim() ? "sorted by ink" : "from style"}>
            <TextInput value={alphabet} onChange={(e) => changeAlphabet(e.target.value)} placeholder="type anything: your name, emoji, 01" maxLength={60} className="font-mono" />
            <div className="truncate font-mono text-[12px] tracking-[0.2em] text-muted-foreground/70" title="dark → bright">{s.charset.trim()}</div>
          </Field>

          <Field label="Look">
            <div className="flex items-center gap-2">
              <div className="flex-1"><Segmented value={s.colorMode} onChange={(v) => set({ colorMode: v })} options={[{ value: "image", label: "image colours" }, { value: "mono", label: "one colour" }]} /></div>
              {s.colorMode === "mono" && <input type="color" value={s.fg} onChange={(e) => set({ fg: e.target.value })} title="ink" />}
              <input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} title="background" />
            </div>
            <Field label="Contrast" value={s.gamma.toFixed(2)} className="mt-2"><Slider min={0.3} max={2.5} step={0.05} value={s.gamma} onChange={(e) => set({ gamma: +e.target.value })} /></Field>
            <Toggle on={s.invert} onChange={(v) => set({ invert: v })} label="Invert" />
          </Field>

          <Field label="Edit" value={edited ? <button onClick={clearEdits} className="underline-offset-2 hover:text-foreground hover:underline">clear edits</button> : undefined}>
            <div className="grid grid-cols-4 gap-1.5">
              {TOOLS.map((t) => (
                <button key={t.id} onClick={() => { setTool(tool === t.id ? "none" : t.id); setTextMode(false); }} title={t.hint} aria-pressed={tool === t.id} className={cn(toolBtn, tool === t.id ? toolOn : toolOff)}>
                  <t.icon className="size-4" />{t.label}
                </button>
              ))}
              <button onClick={() => { setTextMode(!textMode); setTool("none"); }} aria-pressed={textMode} title="edit the result as plain text" className={cn(toolBtn, textMode ? toolOn : toolOff)}>
                <FileText className="size-4" />As text
              </button>
            </div>
            {tool !== "none" && (
              <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <Field label="Brush size" value={brushSize}><Slider min={1} max={12} step={1} value={brushSize} onChange={(e) => setBrushSize(+e.target.value)} /></Field>
                {tool === "alphabet" && <Field label="Paint with"><TextInput value={brushAlphabet} onChange={(e) => setBrushAlphabet(e.target.value)} className="font-mono" placeholder="dark → bright" /></Field>}
                {tool === "color" && <Field label="Paint colour"><div className="flex items-center gap-2"><input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} /><span className="font-mono text-xs text-muted-foreground">{brushColor}</span></div></Field>}
                {tool === "char" && <Field label="Character"><TextInput value={brushChar} onChange={(e) => setBrushChar(e.target.value)} maxLength={2} className="w-20 font-mono text-center" /></Field>}
                <p className="text-[11px] text-muted-foreground"><Brush className="mr-1 inline size-3" />Paint on the image. <kbd className="rounded border border-border px-1">Ctrl</kbd>+<kbd className="rounded border border-border px-1">Z</kbd> undoes a stroke.</p>
              </div>
            )}
          </Field>

          <div>
            <button onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="flex w-full items-center gap-2 text-left">
              <span className="label">Advanced</span><SlidersHorizontal className="size-3 text-muted-foreground" />
              <ChevronDown className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", advanced && "rotate-180")} />
            </button>
            {advanced && (
              <div className="mt-3 flex flex-col gap-4">
                <Field label="Columns" value={`${s.cols} wide`}>
                  <Slider min={40} max={320} step={4} value={s.cols} onChange={(e) => { colsAuto.current = false; set({ cols: +e.target.value }); }} />
                </Field>
                <Field label="Cell shape" value={s.aspect === 1 ? "square" : `${s.aspect.toFixed(2)} wide`}>
                  <Slider min={0.4} max={1.2} step={0.05} value={s.aspect} onChange={(e) => setAspect(+e.target.value)} />
                </Field>
                <Field label="Glyph size" value={`${Math.round(s.glyphScale * 100)}%`}>
                  <Slider min={0.5} max={1.6} step={0.05} value={s.glyphScale} onChange={(e) => set({ glyphScale: +e.target.value })} />
                </Field>
                <Field label="Hide dark cells" value={s.blankBelow.toFixed(2)}><Slider min={0} max={0.5} step={0.01} value={s.blankBelow} onChange={(e) => set({ blankBelow: +e.target.value })} /></Field>
                <Toggle on={s.shade} onChange={(v) => set({ shade: v })} label="Shade ink by brightness" />
                <Toggle on={s.contour} onChange={(v) => set({ contour: v })} label="Contour lines on edges" />
                <div className="label pt-1">Screen effects</div>
                <Field label="Glow" value={s.glow ? `${Math.round(s.glow * 100)}%` : "off"}><Slider min={0} max={1} step={0.05} value={s.glow} onChange={(e) => set({ glow: +e.target.value })} /></Field>
                <Field label="Scanlines" value={s.scan ? `${Math.round(s.scan * 100)}%` : "off"}><Slider min={0} max={0.8} step={0.05} value={s.scan} onChange={(e) => set({ scan: +e.target.value })} /></Field>
                <Toggle on={s.vignette} onChange={(v) => set({ vignette: v })} label="Vignette" />
                <p className="text-[11px] text-muted-foreground">Screen effects apply to PNG exports. SVG and text stay clean.</p>
              </div>
            )}
          </div>

          <div className="mt-auto flex items-center gap-2 border-t border-border pt-5">
            <ExportMenu {...exportProps} size="lg" up className="flex-1" />
            <Button variant="outline" size="lg" onClick={copyText} className="shrink-0">{copied ? <Check className="text-ok" /> : <Copy />}{copied ? "Copied" : "Copy as text"}</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
