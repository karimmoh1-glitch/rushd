// Cookieless public counts, from the browser. Each step is sent at most once
// per day per browser (a local flag that never leaves the device), and never
// from automated browsers, so reloads, tests, and bots don't inflate numbers.
// The only thing sent is the step name: no identifiers, no content.

export function countOnce(step: string): void {
  try {
    if (typeof navigator === "undefined" || navigator.webdriver) return;
    const key = `rushd:counted:${step}:${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    if (!navigator.sendBeacon?.("/api/pv", step)) void fetch("/api/pv", { method: "POST", body: step, keepalive: true });
  } catch {
    // Analytics must never affect the page (storage blocked, offline, ...).
  }
}
