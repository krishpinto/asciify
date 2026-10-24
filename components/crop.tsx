"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Lock, Square, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Segmented } from "./ui";

/** A crop rectangle in source-image pixels. */
export type Rect = { x: number; y: number; w: number; h: number };
const MIN = 16;
type Grab = "move" | "nw" | "ne" | "sw" | "se" | "new";

/** Crop the image to a rect → canvas. */
export function cropToCanvas(img: HTMLImageElement, r: Rect) {
  const c = document.createElement("canvas"); c.width = Math.round(r.w); c.height = Math.round(r.h);
  c.getContext("2d")!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export function fullRect(img: HTMLImageElement): Rect { return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }; }
/** Largest rect of aspect `ratio` (w/h) that fits inside `r`, centred on it. */
export function fitRatio(r: Rect, ratio: number, img: HTMLImageElement): Rect {
  let w = r.w, h = w / ratio;
  if (h > r.h) { h = r.h; w = h * ratio; }
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return { x: clamp(cx - w / 2, 0, img.naturalWidth - w), y: clamp(cy - h / 2, 0, img.naturalHeight - h), w, h };
}

export function CropOverlay({ img, value, lock, onApply, onCancel }: {
  img: HTMLImageElement; value: Rect | null;
  /** When set, the crop is locked to this aspect (w/h), e.g. a wallpaper target. */
  lock?: { ratio: number; label: string } | null;
  onApply: (r: Rect | null) => void; onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [disp, setDisp] = useState({ w: 0, h: 0, ox: 0, oy: 0 });     // where the image sits inside the box
  const [rect, setRect] = useState<Rect>(() => value ?? (lock ? fitRatio(fullRect(img), lock.ratio, img) : fullRect(img)));
  const [square, setSquare] = useState(() => !lock && !!value && Math.abs(value.w - value.h) < 1);
  const ratio = lock ? lock.ratio : square ? 1 : null;                 // null = free
  const drag = useRef<{ grab: Grab; sx: number; sy: number; start: Rect } | null>(null);
  const W = img.naturalWidth, H = img.naturalHeight;
  const scale = disp.w / W || 1;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const bw = e.contentRect.width, bh = e.contentRect.height, k = Math.min(bw / W, bh / H);
      const w = W * k, h = H * k;
      setDisp({ w, h, ox: (bw - w) / 2, oy: (bh - h) / 2 });
    });
    ro.observe(el); return () => ro.disconnect();
  }, [W, H]);

  const toImg = (e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: (e.clientX - b.left - disp.ox) / scale, y: (e.clientY - b.top - disp.oy) / scale };
  };
  // one handler for everything; the element says what it grabs via data-grab
  const onDown = (e: React.PointerEvent) => {
    const grab = (e.currentTarget as HTMLElement).dataset.grab as Grab;
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImg(e);
    drag.current = { grab, sx: p.x, sy: p.y, start: grab === "new" ? { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H), w: 0, h: 0 } : rect };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const p = toImg(e), dx = p.x - d.sx, dy = p.y - d.sy, s = d.start;
    let r: Rect;
    if (d.grab === "move") r = { ...s, x: clamp(s.x + dx, 0, W - s.w), y: clamp(s.y + dy, 0, H - s.h) };
    else {
      const left = d.grab === "nw" || d.grab === "sw", top = d.grab === "nw" || d.grab === "ne";
      const ax = d.grab === "new" ? s.x : left ? s.x + s.w : s.x, ay = d.grab === "new" ? s.y : top ? s.y + s.h : s.y;   // anchor corner
      let px = clamp(d.grab === "new" ? p.x : (left ? s.x : s.x + s.w) + dx, 0, W), py = clamp(d.grab === "new" ? p.y : (top ? s.y : s.y + s.h) + dy, 0, H);
      if (ratio) {
        // keep the aspect: the larger of the two deltas wins, then shrink to stay inside the image
        const sdx = Math.sign(px - ax) || 1, sdy = Math.sign(py - ay) || 1;
        let w = Math.abs(px - ax), h = Math.abs(py - ay);
        if (w / ratio > h) h = w / ratio; else w = h * ratio;
        const maxW = sdx > 0 ? W - ax : ax, maxH = sdy > 0 ? H - ay : ay;
        const k = Math.min(1, maxW / w, maxH / h); w *= k; h *= k;
        px = ax + sdx * w; py = ay + sdy * h;
      }
      r = { x: Math.min(ax, px), y: Math.min(ay, py), w: Math.abs(px - ax), h: Math.abs(py - ay) };
    }
    setRect(r);
  };
  const onUp = () => { drag.current = null; setRect((r) => (r.w < MIN || r.h < MIN ? (value ?? fullRect(img)) : r)); };
  const apply = () => { const full = rect.x <= 0 && rect.y <= 0 && rect.w >= W && rect.h >= H; onApply(full ? null : { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }); };
  const reset = () => setRect(lock ? fitRatio(fullRect(img), lock.ratio, img) : fullRect(img));
  const setMode = (m: "free" | "square") => { setSquare(m === "square"); if (m === "square") setRect((r) => fitRatio(r, 1, img)); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") apply(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  const px = (v: number) => v * scale;
  const handle = (g: Grab, cls: string) => <div data-grab={g} onPointerDown={onDown} className={cn("absolute size-3.5 rounded-[3px] border border-background bg-foreground", cls)} />;

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div ref={box} data-grab="new" className="relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-lg bg-black/40" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute" style={{ left: disp.ox, top: disp.oy, width: disp.w, height: disp.h }} />
        {disp.w > 0 && (
          <div data-grab="move" onPointerDown={onDown} className="absolute cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,.65)] outline outline-1 outline-white/90"
            style={{ left: disp.ox + px(rect.x), top: disp.oy + px(rect.y), width: px(rect.w), height: px(rect.h) }}>
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40 [&>div]:border-white/60 [&>div:nth-child(-n+6)]:border-b [&>div:not(:nth-child(3n))]:border-r"><div /><div /><div /><div /><div /><div /><div /><div /><div /></div>
            {handle("nw", "-left-1.5 -top-1.5 cursor-nwse-resize")}{handle("ne", "-right-1.5 -top-1.5 cursor-nesw-resize")}
            {handle("sw", "-left-1.5 -bottom-1.5 cursor-nesw-resize")}{handle("se", "-right-1.5 -bottom-1.5 cursor-nwse-resize")}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lock
          ? <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] text-muted-foreground"><Lock className="size-3" />locked to {lock.label}</span>
          : <div className="w-56"><Segmented value={square ? "square" : "free"} onChange={setMode} options={[{ value: "free", label: "free" }, { value: "square", label: <span className="inline-flex items-center gap-1.5"><Square className="size-3" />square</span> }]} /></div>}
        <span className="font-mono text-[11px] text-muted-foreground">{Math.round(rect.w)} × {Math.round(rect.h)} px</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}><X />Cancel</Button>
          <Button variant="brand" size="sm" onClick={apply}><Check />Apply crop</Button>
        </div>
      </div>
    </div>
  );
}
