const GAP = 4;

/** Where a popup goes: under its trigger, or above it when the viewport has no room below. */
export function place(trigger: DOMRect, popupHeight: number, align: "start" | "end"): React.CSSProperties {
  const below = trigger.bottom + GAP + popupHeight <= window.innerHeight || trigger.top - GAP - popupHeight < 0;
  return {
    position: "fixed",
    ...(below ? { top: trigger.bottom + GAP } : { bottom: window.innerHeight - trigger.top + GAP }),
    ...(align === "end" ? { right: window.innerWidth - trigger.right } : { left: trigger.left }),
  };
}
