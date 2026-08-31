export const ENV_OPTIONS = [
    { label: "Local", value: "http://127.0.0.1:8080" },
    { label: "Staging", value: "https://plus-staging.polyfrost.org" },
    { label: "Production", value: "https://plus.polyfrost.org" },
] as const;

export const DEFAULT_ENV = ENV_OPTIONS[0].value;
