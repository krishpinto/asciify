"use client";
import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

type Variant = "default" | "brand" | "outline" | "ghost";
type Size = "sm" | "md" | "lg" | "icon";
const V: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/85",
  brand: "bg-brand text-brand-foreground hover:bg-brand/90 shadow-[0_0_0_1px_oklch(0.8_0.15_75/40%),0_8px_30px_-10px_oklch(0.8_0.15_75/50%)]",
  outline: "border-input bg-input/20 hover:bg-input/40 text-foreground",
  ghost: "hover:bg-muted text-muted-foreground hover:text-foreground",
};
const S: Record<Size, string> = { sm: "h-7 px-2.5 text-[12.5px] gap-1.5", md: "h-9 px-3.5 text-sm gap-2", lg: "h-11 px-5 text-[15px] gap-2", icon: "size-9" };

export function Button({ variant = "default", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg]:size-4",
        V[variant], S[size], className,
      )}
      {...props}
    />
  );
}

/** A selectable pill. */
export function Chip({ on, className, ...props }: ComponentProps<"button"> & { on?: boolean }) {
  return (
    <button
      aria-pressed={on}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Mono micro-label with an optional right-side value, over a control. */
export function Field({ label, value, children, className }: { label: string; value?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        {value !== undefined && <span className="font-mono text-[11px] tabular-nums text-muted-foreground/80">{value}</span>}
      </div>
      {children}
    </div>
  );
}

export function Slider(props: ComponentProps<"input">) {
  return <input type="range" {...props} />;
}

/** Two-to-four way segmented control. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid h-8 w-full rounded-lg border border-border bg-card p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} aria-pressed={o.value === value}
          className={cn("rounded-md text-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50", o.value === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="group flex h-8 w-full items-center justify-between rounded-lg px-1 text-[13px] text-muted-foreground transition hover:text-foreground">
      <span>{label}</span>
      <span className={cn("relative h-5 w-9 rounded-full border transition-colors", on ? "border-brand bg-brand" : "border-input bg-input/40")}>
        <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-background transition-transform", on ? "translate-x-4.5" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("h-9 w-full rounded-lg border border-input bg-input/20 px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/40", className)} {...props} />;
}
