const LOCAL = { label: "Local", value: "http://localhost:8080" } as const;
const PRODUCTION = { label: "Production", value: "https://plus.polyfrost.org" } as const;

export const ENV_OPTIONS = [
    // Dev builds only: sign-in hands the backend an Xbox token, which must not
    // go over plain HTTP to whatever listens on an admin's port 8080. And
    // localhost, not 127.0.0.1: the cookie only rides along same-site.
    ...(import.meta.env.DEV ? [LOCAL] : []),
    { label: "Staging", value: "https://plus-staging.polyfrost.org" },
    PRODUCTION,
];

export const DEFAULT_ENV: string = import.meta.env.DEV ? LOCAL.value : PRODUCTION.value;
