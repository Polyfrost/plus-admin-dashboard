import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { ENV_OPTIONS, signIn, verify } from "@/lib/session";
import { DEFAULT_ENV } from "@/lib/settings";

export function SignIn() {
    const [env, setEnv] = useState<string>(
        () => localStorage.getItem("plus-admin-env") ?? DEFAULT_ENV,
    );
    const [password, setPassword] = useState("");
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setChecking(true);
        setError(null);

        const failure = await verify({ env, password });
        setChecking(false);

        if (failure) {
            setError(failure);
            return;
        }

        signIn({ env, password });
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-6">
            <form
                onSubmit={onSubmit}
                className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-gray-800 p-6 shadow-xl"
            >
                <h1 className="flex items-center gap-2 text-xl font-bold text-gray-100">
                    <KeyRound size={20} className="text-[#61dafb]" />
                    Plus Admin
                </h1>

                <label className="flex flex-col gap-1 text-sm text-gray-400">
                    Environment
                    <select
                        value={env}
                        onChange={(event) => setEnv(event.target.value)}
                        className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-gray-200 focus:border-[#61dafb] focus:outline-none"
                    >
                        {ENV_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1 text-sm text-gray-400">
                    Admin password
                    <input
                        type="password"
                        autoFocus
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-gray-200 focus:border-[#61dafb] focus:outline-none"
                    />
                </label>

                {error && <p className="text-sm text-red-300">{error}</p>}

                <button
                    type="submit"
                    disabled={!password || checking}
                    className="flex items-center justify-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50"
                >
                    {checking && (
                        <LoaderCircle size={16} className="animate-spin" />
                    )}
                    {checking ? "Checking…" : "Sign in"}
                </button>
            </form>
        </div>
    );
}
