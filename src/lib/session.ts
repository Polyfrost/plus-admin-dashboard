import { useEffect, useState } from "react";
import { ENV_OPTIONS, DEFAULT_ENV } from "@/lib/settings";

const ENV_KEY = "plus-admin-env";
const PASSWORD_KEY = "plus-admin-password";

export interface Session {
    env: string;
    password: string;
}

type Listener = (session: Session | null) => void;

const listeners = new Set<Listener>();

function read(): Session | null {
    try {
        const password = localStorage.getItem(PASSWORD_KEY);
        if (!password) return null;
        return { env: localStorage.getItem(ENV_KEY) ?? DEFAULT_ENV, password };
    } catch {
        return null;
    }
}

function publish(session: Session | null) {
    for (const listener of listeners) listener(session);
}

export function signIn(session: Session) {
    try {
        localStorage.setItem(ENV_KEY, session.env);
        localStorage.setItem(PASSWORD_KEY, session.password);
    } catch {
        /* private window — the session still holds for this tab */
    }
    publish(session);
}

export function signOut() {
    try {
        localStorage.removeItem(PASSWORD_KEY);
    } catch {
        /* nothing to clear */
    }
    publish(null);
}

/** The signed-in session, or null. Every page reads this instead of asking. */
export function useSession(): Session | null {
    const [session, setSession] = useState<Session | null>(read);

    useEffect(() => {
        listeners.add(setSession);
        // Signing out in one tab signs out the others.
        const onStorage = () => setSession(read());
        window.addEventListener("storage", onStorage);

        return () => {
            listeners.delete(setSession);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    return session;
}

/**
 * Checks the credential before letting anyone in, so a typo fails on the login
 * screen rather than as a broken panel three pages later.
 */
export async function verify(session: Session): Promise<string | null> {
    let response: Response;
    try {
        response = await fetch(`${session.env}/v1/analytics/health`, {
            headers: { Authorization: session.password },
        });
    } catch {
        return `Could not reach ${session.env}.`;
    }

    if (response.status === 401 || response.status === 403) {
        return "That password was not accepted.";
    }
    if (!response.ok) {
        return `${session.env} answered ${response.status}.`;
    }

    return null;
}

/** For pages that only ever render behind the sign-in gate. */
export function useRequiredSession(): Session {
    const session = useSession();
    if (!session) {
        throw new Error("Rendered outside the sign-in gate");
    }
    return session;
}

export { ENV_OPTIONS };
