import { describe, it, expect } from "vitest";
import { SignupSchema } from "./auth";

describe("SignupSchema", () => {
  const base = { email: "student@example.com", password: "password1" };

  it("accepts signup with no invite code field at all", () => {
    // formData.get("inviteCode") returns null, not undefined, when the
    // field was never in the form (e.g. the collapsed "Have an invite
    // code?" toggle never opened) — this must not be rejected as invalid.
    const result = SignupSchema.safeParse({ ...base, inviteCode: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.inviteCode).toBeUndefined();
  });

  it("accepts signup with an empty invite code field", () => {
    const result = SignupSchema.safeParse({ ...base, inviteCode: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.inviteCode).toBeUndefined();
  });

  it("normalizes a provided invite code to trimmed uppercase", () => {
    const result = SignupSchema.safeParse({ ...base, inviteCode: "  abc123  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.inviteCode).toBe("ABC123");
  });
});
