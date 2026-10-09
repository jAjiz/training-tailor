/** Index reached by moving `delta` from `from`, wrapping and skipping disabled entries; `from` when none is enabled. */
export function stepEnabled(disabled: readonly boolean[], from: number, delta: 1 | -1): number {
  const n = disabled.length;
  for (let i = 1; i < n; i++) {
    const j = (((from + delta * i) % n) + n) % n;
    if (!disabled[j]) return j;
  }
  return from;
}

/** Arrow keys as steps (right/down forward, left/up back); null for any other key. */
export function arrowDelta(key: string): 1 | -1 | null {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return null;
}
