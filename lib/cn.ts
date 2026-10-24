/** Tiny class joiner: strings, falsy values are skipped. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
