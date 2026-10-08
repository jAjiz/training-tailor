import type { BlockColor } from "@/lib/training/schemas";

// Full class names so Tailwind finds them in the source.
export const BLOCK_BORDER: Record<BlockColor, string> = {
  neutral: "border-l-neutral-300",
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  yellow: "border-l-yellow-400",
  green: "border-l-green-500",
  blue: "border-l-blue-500",
  purple: "border-l-purple-500",
};

export const BLOCK_SWATCH: Record<BlockColor, string> = {
  neutral: "bg-neutral-300",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

export const borderFor = (color: string) => BLOCK_BORDER[color as BlockColor] ?? BLOCK_BORDER.neutral;
