/**
 * Microsoft sign-in, done in the browser up to the XSTS token. The last hop
 * (XSTS -> Minecraft profile) is the backend's: Mojang sends no CORS headers.
 */
import { apiFetch, isKnownEnv, setEnv } from "@/lib/session";

/** OneClient's Azure app, which Mojang has approved for the Minecraft API. */
const CLIENT_ID = "9419b7ee-1448-4d1b-b52a-550d8f36ab56";
const PENDING_KEY = "plus-admin-ms-pending";

interface Pending {
    env: string;
    state: string;
    verifier: string;
}

function base64url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function randomString(): string {
    return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return base64url(new Uint8Array(digest));
}

/** Where Microsoft sends the browser back: this page, minus any hash route. */
function redirectUri(): string {
    return `${location.origin}${location.pathname}`;
}

export async function startMicrosoftSignIn(env: string) {
    const pending: Pending = { env, state: randomString(), verifier: randomString() };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    setEnv(env);

    const url = new URL(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    );
    url.search = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        // The router lives in the hash, so the code has to come back in the query.
        response_mode: "query",
        redirect_uri: redirectUri(),
        scope: "XboxLive.signin",
        state: pending.state,
        code_challenge: await pkceChallenge(pending.verifier),
        code_challenge_method: "S256",
        prompt: "select_account",
    }).toString();
    location.assign(url);
}

/** Whether this page load is Microsoft redirecting back. */
export function isMicrosoftCallback(): boolean {
    const params = new URLSearchParams(location.search);
    return params.has("state") && (params.has("code") || params.has("error"));
}

/** Xbox's reasons for refusing an account, by `XErr`. */
const XBOX_ERRORS: Record<number, string> = {
    2148916227: "That Xbox account is banned.",
    2148916233: "That Microsoft account has no Xbox profile. Sign in at minecraft.net once to create one.",
    2148916235: "Xbox Live is not available in your country.",
    2148916236: "That account needs adult verification on the Xbox site.",
    2148916237: "That account needs adult verification on the Xbox site.",
    2148916238: "That is a child account; an adult has to add it to a Microsoft family.",
};

export function xboxError(xerr: number | undefined): string {
    return (xerr !== undefined && XBOX_ERRORS[xerr]) || "Xbox Live refused that account.";
}

async function postJson(url: string, body: unknown) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(xboxError(json.XErr));
    return json as { Token: string; DisplayClaims: { xui: { uhs: string }[] } };
}

async function exchange(pending: Pending, params: URLSearchParams) {
    // Before anything else, so a crafted link can neither inject an error
    // message nor redeem a code this browser did not ask for.
    if (params.get("state") !== pending.state) {
        throw new Error("Sign-in state did not match; try again.");
    }
    if (params.get("error")) {
        throw new Error(params.get("error_description") ?? params.get("error")!);
    }
    // The XSTS token is a key to the Minecraft account: only a listed backend gets it.
    if (!isKnownEnv(pending.env)) {
        throw new Error("Unknown environment; pick one from the list.");
    }

    const tokenResponse = await fetch(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
        {
            method: "POST",
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                grant_type: "authorization_code",
                code: params.get("code")!,
                redirect_uri: redirectUri(),
                code_verifier: pending.verifier,
            }),
        },
    );
    const microsoft = await tokenResponse.json();
    if (!tokenResponse.ok) {
        throw new Error(microsoft.error_description ?? "Microsoft sign-in failed.");
    }

    const xbl = await postJson("https://user.auth.xboxlive.com/user/authenticate", {
        Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: `d=${microsoft.access_token}`,
        },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
    });
    const xsts = await postJson("https://xsts.auth.xboxlive.com/xsts/authorize", {
        Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] },
        RelyingParty: "rp://api.minecraftservices.com/",
        TokenType: "JWT",
    });

    const login = await apiFetch({ env: pending.env }, "/v1/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_hash: xsts.DisplayClaims.xui[0].uhs,
            xsts_token: xsts.Token,
        }),
    });
    if (!login.ok) {
        throw new Error((await login.text()).trim() || `Sign-in failed (${login.status})`);
    }
}

let finishing: Promise<string | null> | undefined;

/**
 * Completes a sign-in Microsoft redirected back from, resolving to an error
 * message or null. Memoised: an authorization code only redeems once, and
 * StrictMode runs effects twice.
 */
export function finishMicrosoftSignIn(): Promise<string | null> {
    finishing ??= (async () => {
        const params = new URLSearchParams(location.search);
        const raw = sessionStorage.getItem(PENDING_KEY);
        sessionStorage.removeItem(PENDING_KEY);
        // Drop the code from the address bar and history either way.
        history.replaceState(null, "", `${location.pathname}${location.hash}`);

        if (!raw) return "Sign-in expired; try again.";
        try {
            await exchange(JSON.parse(raw), params);
            return null;
        } catch (error) {
            return (error as Error).message;
        }
    })();
    return finishing;
}
