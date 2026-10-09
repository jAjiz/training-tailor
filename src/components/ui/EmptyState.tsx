import { Card } from "./Card";

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <Card className="px-6 py-10 text-center text-[15px] text-muted">{children}</Card>;
}
