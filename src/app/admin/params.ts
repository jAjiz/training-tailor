import { z } from "zod";

export const COACH_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export type CoachStatus = (typeof COACH_STATUSES)[number];

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const Page = z.coerce.number().int().min(0).max(10_000);
const Search = z.string().trim().min(1).max(100);
const Status = z.enum(COACH_STATUSES);

/** List pages' query string, with safe defaults: anything unexpected is ignored, never an error. */
export function parseListParams(sp: SearchParams): { search?: string; status?: CoachStatus; page: number } {
  const page = Page.safeParse(first(sp.page) ?? "0");
  const search = Search.safeParse(first(sp.search));
  const status = Status.safeParse(first(sp.status));
  return {
    page: page.success ? page.data : 0,
    search: search.success ? search.data : undefined,
    status: status.success ? status.data : undefined,
  };
}

/** A list page's URL with the given query, empty values left out. */
export function listHref(path: string, query: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "" && !(k === "page" && v === 0)) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

const AuditUser = z.string().min(1).max(64);
const AuditAction = z.string().regex(/^[A-Za-z_.]{1,64}$/);

/** The audit page's filters: target user id, action name, page. */
export function parseAuditParams(sp: SearchParams): { user?: string; action?: string; page: number } {
  const user = AuditUser.safeParse(first(sp.user)?.trim());
  const action = AuditAction.safeParse(first(sp.action)?.trim());
  return {
    page: parseListParams(sp).page,
    user: user.success ? user.data : undefined,
    action: action.success ? action.data : undefined,
  };
}
