import { parse } from "pg-connection-string";

const HOST_OVERRIDES = ["host", "hostaddr", "service"];

// Refuses to run unless the database host is the one explicitly allowed.
// The host is read with the parser pg connects with, and query parameters that
// could redirect the connection to another host are refused.
export function assertImportAllowed(databaseUrl: string | undefined, allowedHost: string | undefined): void {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  if (!allowedHost) throw new Error("DOMAIN_IMPORT_HOST is not set; set it to the dev database host.");
  let params: URLSearchParams;
  try {
    params = new URL(databaseUrl).searchParams;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  for (const name of HOST_OVERRIDES) {
    if (params.has(name)) throw new Error(`Refusing to import: DATABASE_URL carries a "${name}" parameter.`);
  }
  if ((params.get("options") ?? "").includes("endpoint=")) {
    throw new Error('Refusing to import: DATABASE_URL carries an "endpoint" option.');
  }
  const host = (parse(databaseUrl).host ?? "").toLowerCase();
  if (host !== allowedHost.toLowerCase()) {
    throw new Error(`Refusing to import: database host ${host} is not DOMAIN_IMPORT_HOST (${allowedHost}).`);
  }
}
