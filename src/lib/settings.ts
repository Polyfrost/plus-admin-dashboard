import { useEffect, useState } from "react";

export const ENV_OPTIONS = [
    { label: "Local", value: "http://127.0.0.1:8080" },
    { label: "Staging", value: "https://plus-staging.polyfrost.org" },
    { label: "Production", value: "https://plus.polyfrost.org" },
] as const;

export const DEFAULT_ENV = ENV_OPTIONS[0].value;

const ENV_KEY = "plus-admin-env";
const PASSWORD_KEY = "plus-admin-password";

function useLocalStorage(
    key: string,
    initial: string,
): readonly [string, (next: string) => void] {
    const [value, setValue] = useState<string>(
        () => localStorage.getItem(key) ?? initial,
    );

    useEffect(() => {
        localStorage.setItem(key, value);
    }, [key, value]);

    return [value, setValue] as const;
}

export function useEnv() {
    return useLocalStorage(ENV_KEY, DEFAULT_ENV);
}

export function usePassword() {
    return useLocalStorage(PASSWORD_KEY, "");
}
