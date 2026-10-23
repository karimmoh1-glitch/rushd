import { log } from "@/lib/log";

/** When a cron job throws, record only the error's name so the run can still finish. */
export function jobFailure(error: Error): { error: string } {
  log.error("cron.job_failed", { err: error });
  return { error: error?.name ?? "failed" };
}
