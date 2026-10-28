export const ERROR_CODES = [
  "unauthorized",
  "not_found",
  "invalid_request",
  "coach_pending",
  "program_archived",
  "start_date_locked",
  "weeks_out_of_range",
  "day_out_of_range",
  "scoring_locked",
  "invite_invalid",
  "enrollment_removed",
  "not_loggable",
  "invalid_score",
  "own_result",
  "account_disabled",
  "invite_required",
  "invalid_status_change",
  "invite_disabled",
  "not_enrolled",
  "announcement_empty",
  "announcement_too_long",
  "push_unavailable",
  "week_empty",
  "library_conflict",
  "library_draft_exists",
  "library_no_draft",
  "library_invalid",
  "import_pdf_invalid",
  "import_pdf_too_large",
  "import_unavailable",
  "import_quota",
  "import_empty",
  "import_failed",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** A refusal the user can be told about; its code maps to `errors.<code>` in the messages. */
export class TrainingError extends Error {
  constructor(public readonly code: ErrorCode, public readonly issues?: string[]) {
    super(code);
    this.name = "TrainingError";
  }
}

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; code: ErrorCode; issues?: string[] };
