import { expect, test } from "vitest";
import { pkceChallenge, xboxError } from "@/lib/microsoft";
import { KEY_FORBIDDEN, Perm, has, hasAny, permissionLabels } from "@/lib/permissions";

// Expected value from Python: urlsafe_b64encode(sha256(verifier)) without padding.
test("PKCE challenge is unpadded base64url SHA-256", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mJ92K9q2xxu0tlBAr_D0eWqEGjXCBc")).toBe(
        "YqJuJMWcDZdktjJs4w1P_Mau1022988LS2li5yUUKEA",
    );
});

test("Xbox errors explain known codes and fall back otherwise", () => {
    expect(xboxError(2148916233)).toMatch(/no Xbox profile/);
    expect(xboxError(1)).toBe("Xbox Live refused that account.");
    expect(xboxError(undefined)).toBe("Xbox Live refused that account.");
});

test("permission checks mirror the backend", () => {
    expect(Perm.USE_SPECIAL_CHAT).toBe(512n);
    expect(has(Perm.USE_SPECIAL_CHAT, Perm.VIEW_ANALYTICS)).toBe(false);
    expect(has(Perm.ADMINISTRATOR, Perm.VIEW_ANALYTICS | (1n << 63n))).toBe(true);
    expect(hasAny(Perm.GRANT_COSMETICS, Perm.MANAGE_STORE | Perm.GRANT_COSMETICS)).toBe(true);
    expect(hasAny(Perm.USE_SPECIAL_CHAT, Perm.MANAGE_STORE)).toBe(false);
});

test("API key flags mirror the backend", () => {
    // ADMINISTRATOR | MANAGE_ROLES | MANAGE_API_TOKENS, as in permissions.rs
    expect(KEY_FORBIDDEN).toBe(0b1_0000_0011n);
    expect(permissionLabels(Perm.VIEW_ANALYTICS | (1n << 40n))).toEqual(["View analytics"]);
});

test("split flags sit at the bits the backend migration uses", () => {
    expect(Perm.VIEW_REVENUE).toBe(1024n);
    expect(Perm.VIEW_ORDERS | Perm.MANAGE_DISCOUNTS | Perm.MANAGE_REFERRALS).toBe(14336n);
});
