"use client";
import { useEffect, useRef, useState } from "react";
import { ImageIcon, Upload, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/** Load a File (or URL) into a decoded image element. */
export async function loadImage(src: File | string): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export function Home({ onImage }: { onImage: (img: HTMLImageElement, name: string) => void }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function take(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("That isn't an image. PNG, JPG, WebP, GIF or SVG."); return; }
    setBusy(true); setErr("");
    try { onImage(await loadImage(file), file.name.replace(/\.[^.]+$/, "")); }
    catch { setErr("Couldn't read that image. Try a PNG or JPG."); }
    finally { setBusy(false); }
  }
  async function sample() {
    setBusy(true);
    try { onImage(await loadImage("/sample.svg"), "sample"); } finally { setBusy(false); }
  }

  // paste an image from the clipboard anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/")); if (f) take(f); };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  return (
    <main className="flex flex-1 flex-col items-center px-5 pb-16 pt-[12vh]"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}>
      <div className="rise flex w-full max-w-2xl flex-col items-center text-center">
        <p className="label mb-5">free · private · no account</p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Image to ASCII art.</h1>
        <p className="mt-4 max-w-md text-balance text-base text-muted-foreground sm:text-lg">
          Drop a picture, pick a look, fix what you don&apos;t like with a brush or by editing the text, download it.
        </p>

        <button onClick={() => input.current?.click()} disabled={busy}
          className={cn(
            "group mt-10 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            over ? "border-brand bg-brand/10 scale-[1.01]" : "border-input bg-card/50 hover:border-foreground/40 hover:bg-card",
          )}>
          <span className={cn("flex size-14 items-center justify-center rounded-full border bg-background transition-transform group-hover:scale-105", over ? "border-brand text-brand" : "border-border text-muted-foreground")}>
            {busy ? <Sparkles className="size-6 animate-pulse" /> : over ? <ImageIcon className="size-6" /> : <Upload className="size-6" />}
          </span>
          <span className="text-lg font-medium">{busy ? "Reading…" : over ? "Let go" : "Drop an image here"}</span>
          <span className="text-sm text-muted-foreground">or click to choose · or paste from the clipboard</span>
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />

        {err ? <p className="mt-4 text-sm text-bad">{err}</p>
             : <button onClick={sample} className="mt-4 text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline">No image handy? Try a sample</button>}
      </div>

      <ul className="rise mt-16 grid max-w-2xl grid-cols-1 gap-x-10 gap-y-3 text-sm text-muted-foreground sm:grid-cols-3 [animation-delay:120ms]">
        <li><span className="text-foreground">Runs in your browser.</span> Nothing is uploaded.</li>
        <li><span className="text-foreground">Edit the result.</span> Brush out mistakes, or edit it as text.</li>
        <li><span className="text-foreground">PNG, SVG or text.</span> Any size, any alphabet.</li>
      </ul>
    </main>
  );
}
