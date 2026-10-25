import Image from "next/image";
import { cx } from "@/components/ui/cx";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
      Training Tailor
    </span>
  );
}
