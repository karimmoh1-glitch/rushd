// One path per evening run (vercel.json), so each schedule is its own cron
// job; they all run the same handler.
export { GET } from "../route";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
