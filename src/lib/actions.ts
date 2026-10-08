import { notFound, unstable_rethrow } from "next/navigation";
import { TrainingError, type ActionResult } from "@/lib/training/errors";

/** Runs a Server Action body: refusals become codes, anything else is logged and becomes `internal`. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof TrainingError) return { ok: false, code: e.code };
    console.error("[action] failed", e);
    return { ok: false, code: "internal" };
  }
}

/** For pages: a service's `not_found` becomes the 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof TrainingError && e.code === "not_found") notFound();
    throw e;
  }
}
