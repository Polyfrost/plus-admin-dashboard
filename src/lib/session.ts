import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ENV_OPTIONS, DEFAULT_ENV } from "@/lib/settings";

const ENV_KEY = "plus-admin-env";

/**
 * Which backend to talk to. The credential itself is an HttpOnly cookie the
 * backend sets, which page scripts can never read; `bearer` overrides it to
 * act as another player (the Special Chat account, a linking player).
 */
export interface Session {
    env: string;
    bearer?: string;
    /** Chat routes only: act as a player who made the signed-in one their delegate. */
    actAs?: string;
}

export interface Role {
    id: number;
    name: string;
    color: number | null;
    position: number;
    /** u64 flags as a decimal string. */
    permissions: string;
}

export interface Me {
    id: string;
    username: string | null;
    permissions: bigint;
    roles: Role[];
}

type Listener = (env: string) => void;
const listeners = new Set<Listener>();

/** Only ever the listed backends: they receive the Xbox token at sign-in. */
export function isKnownEnv(env: string): boolean {
    return ENV_OPTIONS.some((option) => option.value === env);
}

function readEnv(): string {
    try {
        const env = localStorage.getItem(ENV_KEY);
        return env && isKnownEnv(env) ? env : DEFAULT_ENV;
    } catch {
        return DEFAULT_ENV;
    }
}

export function setEnv(env: string) {
    if (!isKnownEnv(env)) return;
    try {
        localStorage.setItem(ENV_KEY, env);
    } catch {
        /* private window — the choice still holds for this tab */
    }
    for (const listener of listeners) listener(env);
}

/** Every request goes through here so the session cookie always rides along. */
export function apiFetch(
    session: Session,
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    return fetch(`${session.env}${path}`, {
        ...init,
        credentials: "include",
        headers: {
            ...(session.bearer && {
                Authorization: `Bearer ${session.bearer}`,
            }),
            ...(session.actAs && { "x-polyplus-act-as": session.actAs }),
            ...init.headers,
        },
    });
}

export function useSession(): Session {
    const [env, setState] = useState(readEnv);

    useEffect(() => {
        listeners.add(setState);
        const onStorage = () => setState(readEnv());
        window.addEventListener("storage", onStorage);
        return () => {
            listeners.delete(setState);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    return { env };
}

export const meKey = (env: string) => ["me", env];

/** Who is signed in, or null when nobody is (or their session expired). */
export function useMe() {
    const session = useSession();
    return useQuery<Me | null>({
        queryKey: meKey(session.env),
        queryFn: async () => {
            const response = await apiFetch(session, "/v1/me");
            if (response.status === 401 || response.status === 403) {
                return null;
            }
            if (!response.ok) {
                throw new Error(`${session.env} answered ${response.status}`);
            }
            const me = await response.json();
            return { ...me, permissions: BigInt(me.permissions) };
        },
        enabled: true,
        refetchOnWindowFocus: true,
        staleTime: 5 * 60_000,
    });
}

/** The signed-in player. Only call behind the sign-in gate. */
export function useRequiredMe(): Me {
    const me = useMe().data;
    if (!me) throw new Error("Rendered outside the sign-in gate");
    return me;
}

export async function signOut(session: Session) {
    await apiFetch(session, "/v1/dashboard/logout", { method: "POST" });
}

export { ENV_OPTIONS };
