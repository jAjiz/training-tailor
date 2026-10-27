import { useTranslations } from "next-intl";
import type { LibraryFinding } from "@/lib/domain/validate-library";
import { Tag } from "../ui";

type Group = { key: string; entity: LibraryFinding["entity"]; ref: string | null; findings: LibraryFinding[] };

/** Findings grouped by entity and ref; groups and findings with an error come first. */
function group(findings: readonly LibraryFinding[]): Group[] {
  const groups = new Map<string, Group>();
  for (const f of findings) {
    const key = `${f.entity}|${f.ref ?? ""}`;
    const g = groups.get(key) ?? { key, entity: f.entity, ref: f.ref, findings: [] };
    g.findings.push(f);
    groups.set(key, g);
  }
  const rank = (g: Group) => (g.findings.some((f) => f.level === "error") ? 0 : 1);
  return [...groups.values()]
    .map((g) => ({ ...g, findings: [...g.findings].sort((a, b) => Number(b.level === "error") - Number(a.level === "error")) }))
    .sort((a, b) => rank(a) - rank(b));
}

export function FindingsList({ findings }: { findings: readonly LibraryFinding[] }) {
  const t = useTranslations("admin.library");
  if (findings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {group(findings).map((g) => (
        <li key={g.key} className="rounded-xl bg-surface-2 p-4">
          <p className="text-sm font-semibold">{t(`entity.${g.entity}`)}{g.ref && <span className="font-normal text-muted">{` · ${g.ref}`}</span>}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {g.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Tag color={f.level === "error" ? "red" : "yellow"}>{t(f.level === "error" ? "errors" : "warnings")}</Tag>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
