import { describe, it, expect, vi, beforeEach } from "vitest";
import { countOnce } from "./beacon";

describe("countOnce", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(() => true), configurable: true });
  });

  it("sends each step once per browser per day, with nothing but the step name", () => {
    countOnce("/");
    countOnce("/");
    countOnce("#try");
    const calls = vi.mocked(navigator.sendBeacon).mock.calls;
    expect(calls).toEqual([["/api/pv", "/"], ["/api/pv", "#try"]]);
  });

  it("never counts automated browsers", () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    countOnce("/");
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });
});
