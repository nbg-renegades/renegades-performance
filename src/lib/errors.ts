/**
 * Pulls a message out of whatever a `catch` hands you.
 *
 * Call sites used to write `catch (error: any)` and reach straight for `error.message`,
 * which silently assumes the thrown value is an Error. It usually is - but a rejected
 * fetch, a thrown string or a PostgrestError all land in the same clause, and only the
 * first has a `.message` you can trust.
 */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error) return error.message;

  // Supabase returns plain objects shaped like { message, details, hint, code }.
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string" && message.trim() !== "") return message;
  }

  if (typeof error === "string" && error.trim() !== "") return error;

  return fallback;
}
