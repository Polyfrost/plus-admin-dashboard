import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LoaderCircle } from "lucide-react";
import { ENV_OPTIONS, apiFetch, meKey, setEnv, useSession } from "@/lib/session";
import { startMicrosoftSignIn } from "@/lib/microsoft";

export function SignIn({ error: initialError }: { error: string | null }) {
    const { env } = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(initialError);

    return (
        <div className="flex min-h-screen items-center justify-center p-6">
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-gray-800 p-6 shadow-xl">
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

                {error && <p className="text-sm text-red-300">{error}</p>}

                <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        setBusy(true);
                        setError(null);
                        startMicrosoftSignIn(env).catch((failure: Error) => {
                            setBusy(false);
                            setError(failure.message);
                        });
                    }}
                    className="flex items-center justify-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50"
                >
                    {busy && <LoaderCircle size={16} className="animate-spin" />}
                    Sign in with Microsoft
                </button>
                <p className="text-xs text-gray-500">
                    Use the Microsoft account that owns your Minecraft
                    account. Only players with a role can sign in.
                </p>

                {new URL(env).hostname === "localhost" && (
                    <DevSignIn env={env} onError={setError} />
                )}
            </div>
        </div>
    );
}

/** Debug backends only: sign in as any player without Microsoft. */
function DevSignIn({ env, onError }: { env: string; onError: (error: string) => void }) {
    const queryClient = useQueryClient();
    const [player, setPlayer] = useState("");

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        const response = await apiFetch({ env }, "/v1/dashboard/dev-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player: player.trim() }),
        }).catch(() => null);

        if (!response?.ok) {
            onError(
                response
                    ? (await response.text()) || `Dev sign-in failed (${response.status})`
                    : `Could not reach ${env}.`,
            );
            return;
        }
        await queryClient.invalidateQueries({ queryKey: meKey(env) });
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-gray-700 pt-4">
            <label className="flex flex-col gap-1 text-sm text-gray-400">
                Dev sign-in (debug backend)
                <input
                    value={player}
                    onChange={(event) => setPlayer(event.target.value)}
                    placeholder="Player UUID"
                    className="rounded border border-gray-600 bg-gray-700 px-3 py-2 font-mono text-sm text-gray-200 focus:border-[#61dafb] focus:outline-none"
                />
            </label>
            <button
                type="submit"
                disabled={!player.trim()}
                className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:text-gray-100 disabled:opacity-50"
            >
                Sign in as player
            </button>
        </form>
    );
}
