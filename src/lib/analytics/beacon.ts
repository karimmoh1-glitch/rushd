// Cookieless public counts from the browser: each step at most once per day per
// browser (a local flag that never leaves the device), never from automated
// browsers. Only the step name is sent: no identifiers, no content.

export function countOnce(step: string): void {
  try {
    if (typeof navigator === "undefined" || navigator.webdriver) return;
    const key = `rushd:counted:${step}:${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    // Fall back to fetch when sendBeacon is missing or refuses the request.
    const queued = navigator.sendBeacon ? navigator.sendBeacon("/api/pv", step) : false;
    if (!queued) void fetch("/api/pv", { method: "POST", body: step, keepalive: true });
  } catch {
    // Analytics must never affect the page (storage blocked, offline, ...).
  }
}
