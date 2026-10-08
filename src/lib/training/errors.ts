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
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** A refusal the user can be told about; its code maps to `errors.<code>` in the messages. */
export class TrainingError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = "TrainingError";
  }
}

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; code: ErrorCode };
