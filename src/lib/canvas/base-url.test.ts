import { describe, it, expect } from "vitest";
import { normalizeCanvasBaseUrl, CanvasUrlError } from "./base-url";

function codeOf(input: string): string | undefined {
  try {
    normalizeCanvasBaseUrl(input);
  } catch (e) {
    return e instanceof CanvasUrlError ? e.code : "OTHER";
  }
  return undefined;
}

describe("normalizeCanvasBaseUrl", () => {
  it("accepts a bare host and adds https", () => {
    expect(normalizeCanvasBaseUrl("school.instructure.com")).toBe("https://school.instructure.com");
    expect(normalizeCanvasBaseUrl("  School.Instructure.COM/ ")).toBe("https://school.instructure.com");
  });

  it("keeps only the origin from a pasted deep link", () => {
    expect(
      normalizeCanvasBaseUrl("https://canvas.myschool.edu/courses/1234/assignments?x=1#top"),
    ).toBe("https://canvas.myschool.edu");
  });

  it("refuses http and other schemes", () => {
    expect(codeOf("http://school.instructure.com")).toBe("NOT_HTTPS");
    expect(codeOf("ftp://school.instructure.com")).toBe("NOT_HTTPS");
    expect(codeOf("file:///etc/passwd")).toBe("NOT_HTTPS");
  });

  it("refuses credentials and ports", () => {
    expect(codeOf("https://user:pw@school.instructure.com")).toBe("HAS_CREDENTIALS");
    expect(codeOf("https://school.instructure.com:8443")).toBe("HAS_PORT");
  });

  it("refuses IP literals and local names", () => {
    expect(codeOf("https://127.0.0.1")).toBe("IP_LITERAL");
    expect(codeOf("https://169.254.169.254")).toBe("IP_LITERAL");
    expect(codeOf("https://[::1]")).toBe("IP_LITERAL");
    expect(codeOf("https://2130706433")).toBe("IP_LITERAL"); // decimal 127.0.0.1
    expect(codeOf("https://0x7f.1")).toBe("IP_LITERAL"); // hex shorthand
    expect(codeOf("https://localhost")).toBe("LOCAL_NAME");
    expect(codeOf("https://canvas")).toBe("LOCAL_NAME");
    expect(codeOf("https://canvas.local")).toBe("LOCAL_NAME");
    expect(codeOf("https://metadata.internal")).toBe("LOCAL_NAME");
  });

  it("refuses empty and garbage", () => {
    expect(codeOf("")).toBe("EMPTY");
    expect(codeOf("   ")).toBe("EMPTY");
    expect(codeOf("not a url at all")).toBe("NOT_URL");
    expect(codeOf("https://exa mple.com")).toBe("NOT_URL");
  });
});
