"use client";
import { useState } from "react";
import { Home } from "@/components/home";
import { Editor } from "@/components/editor";
import { Logo } from "@/components/logo";

export default function Page() {
  const [img, setImg] = useState<{ el: HTMLImageElement; name: string } | null>(null);
  return img
    ? <Editor img={img.el} name={img.name} onReset={() => setImg(null)} />
    : (
      <>
        <header className="flex h-12 items-center px-4"><Logo /></header>
        <Home onImage={(el, name) => setImg({ el, name })} />
        <footer className="px-4 py-6 text-center font-mono text-[11px] text-muted-foreground/70">made by krish</footer>
      </>
    );
}
