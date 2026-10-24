import { cn } from "@/lib/cn";

/** The mark: a 3×2 block of ramp characters, the product in six glyphs. */
export function Mark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-grid select-none font-mono text-[9px] leading-[9px] tracking-[0.02em] text-brand", className)}>
      <span>.:*</span>
      <span>*#@</span>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <Mark />
      <span className="font-mono tracking-wide">asciify</span>
    </span>
  );
}
