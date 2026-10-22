// Bundled launcher + offline page. Checks that Rushd is reachable, then hands the
// window over to https://therushd.com. If the check fails it shows the offline
// state with a "Try again" button. No Tauri APIs are used here.
(() => {
  "use strict";

  const ORIGIN = "https://therushd.com";
  const DEFAULT_PATH = "/dashboard";
  const TIMEOUT_MS = 10000;

  // `?next=/some/path` (set by the native Reload menu item) returns to the same
  // page; only paths on the Rushd origin are accepted.
  function targetUrl() {
    const next = new URLSearchParams(location.search).get("next");
    if (next) {
      try {
        const url = new URL(next, ORIGIN);
        if (url.origin === ORIGIN) return url.href;
      } catch (_) {
        /* fall through to the default */
      }
    }
    return ORIGIN + DEFAULT_PATH;
  }

  const body = document.body;
  const retry = document.getElementById("retry");
  const detail = document.getElementById("detail");
  let checking = false;

  async function connect() {
    if (checking) return;
    checking = true;
    retry.disabled = true;
    body.dataset.state = "connecting";
    detail.textContent = "";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // An opaque (no-cors) response is enough to prove the network path works.
      await fetch(ORIGIN + "/", {
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });
      location.replace(targetUrl());
      return;
    } catch (err) {
      body.dataset.state = "offline";
      detail.textContent = navigator.onLine
        ? "Rushd didn't respond. It may be a network or server problem."
        : "Your computer appears to be offline.";
      retry.focus();
    } finally {
      clearTimeout(timer);
      checking = false;
      retry.disabled = false;
    }
  }

  retry.addEventListener("click", connect);
  window.addEventListener("online", () => {
    if (body.dataset.state === "offline") connect();
  });
  connect();
})();
