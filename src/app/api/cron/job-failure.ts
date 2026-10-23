/** When a cron job throws, record only the error's name so the run can still finish. */
export function jobFailure(error: Error): { error: string } {
  return { error: error?.name ?? "failed" };
}
