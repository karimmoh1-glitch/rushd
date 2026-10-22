import { STUDY_EVENTS } from "@/lib/streak/streak";

// What counts as a student actually using Rushd, defined once for every
// metric. System-written events (plan_generated from the daily cron) and page
// views (dashboard_viewed, insights_viewed, ...) are never activity.

/** Getting work into Rushd: the first plan exists once one of these happens. */
export const SETUP_EVENTS = [
  "assignment_created",
  "exam_created",
  "assignment_confirmed",
  "try_week_imported",
  "canvas_synced",
  "canvas_feed_connected",
  "teams_synced",
];

/** Real studying: the same list the streak counts. */
export { STUDY_EVENTS };

/** A student is active on a day with any of these. */
export const ACTIVE_EVENTS = [...SETUP_EVENTS, ...STUDY_EVENTS];

/** Accounts that are tests or staff, never counted in growth metrics. */
export function isTestOrStaff(user: { email: string; isAdmin: boolean }): boolean {
  return user.isAdmin || user.email.endsWith("@example.com") || user.email.startsWith("integration-test-");
}
