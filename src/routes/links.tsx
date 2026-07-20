import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
    Link2,
    Plus,
    Trash2,
    Copy,
    Check,
    RefreshCw,
    ExternalLink,
} from "lucide-react";
import { ENV_OPTIONS, useEnv, usePassword } from "@/lib/settings";

export const Route = createFileRoute("/links")({
    component: Links,
});

interface TrackedLink {
    slug: string;
    target_url: string;
    clicks: number;
    created_at: string;
}

interface ListResponse {
    links: TrackedLink[];
}

async function api(
    env: string,
    password: string,
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    return fetch(`${env}${path}`, {
        ...init,
        headers: {
            Authorization: password,
            "Content-Type": "application/json",
            ...init.headers,
        },
    });
}

/**
 * The branded share link a visitor should be given for a slug. Always the
 * production website origin: that is what forwards to the backend redirector,
 * regardless of which backend environment is selected for management here.
 */
function shareUrl(slug: string): string {
    return `https://polyfrost.org/go/${encodeURIComponent(slug)}`;
}

function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                void navigator.clipboard?.writeText(value);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
            }}
            className="inline-flex items-center gap-1 text-[#61dafb] hover:underline"
            title={value}
        >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
        </button>
    );
}

function Links() {
    const [env, setEnv] = useEnv();
    const [password, setPassword] = usePassword();

    const [slug, setSlug] = useState("");
    const [targetUrl, setTargetUrl] = useState("");
    const [formError, setFormError] = useState<string | null>(null);

    const listKey = ["links", env] as const;

    const { data, isFetching, error, refetch } = useQuery<ListResponse>({
        queryKey: listKey,
        queryFn: async () => {
            const res = await api(env, password, "/links");
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`${res.status} ${text}`.trim());
            }
            return res.json();
        },
        enabled: false,
    });

    const createMutation = useMutation({
        mutationFn: async () => {
            const res = await api(env, password, "/links", {
                method: "POST",
                body: JSON.stringify({
                    slug: slug.trim(),
                    target_url: targetUrl.trim(),
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`${res.status} ${text}`.trim());
            }
            return res.json() as Promise<TrackedLink>;
        },
        onSuccess: () => {
            setSlug("");
            setTargetUrl("");
            setFormError(null);
            // The list query is manual (enabled: false), so invalidation alone
            // would not refresh it — refetch explicitly.
            void refetch();
        },
        onError: (err) => setFormError((err as Error).message),
    });

    const deleteMutation = useMutation({
        mutationFn: async (slugToDelete: string) => {
            const res = await api(
                env,
                password,
                `/links/${encodeURIComponent(slugToDelete)}`,
                { method: "DELETE" },
            );
            if (!res.ok && res.status !== 404) {
                const text = await res.text();
                throw new Error(`${res.status} ${text}`.trim());
            }
        },
        onSuccess: () => void refetch(),
    });

    const links = data?.links ?? [];

    return (
        <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
                    <Link2 size={22} className="text-[#61dafb]" />
                    Tracked links
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                    <select
                        value={env}
                        onChange={(e) => setEnv(e.target.value)}
                        className="bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    >
                        {ENV_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="password"
                        placeholder="Admin password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    />
                    <button
                        onClick={() => refetch()}
                        disabled={!password || isFetching}
                        className="flex items-center gap-2 bg-[#61dafb] text-gray-900 font-semibold px-4 py-2 rounded disabled:opacity-50"
                    >
                        <RefreshCw
                            size={16}
                            className={isFetching ? "animate-spin" : ""}
                        />
                        {isFetching ? "Loading…" : "Load"}
                    </button>
                </div>
            </div>

            <p className="text-sm text-gray-500 -mt-2">
                Branded share links resolve at{" "}
                <code className="text-gray-400">polyfrost.org/go/&lt;slug&gt;</code>{" "}
                and count unique visits. Set the environment and admin password,
                then press Load.
            </p>

            {/* Create */}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    createMutation.mutate();
                }}
                className="bg-gray-800 p-4 rounded-lg shadow-xl flex flex-col gap-3"
            >
                <div className="text-gray-300 font-semibold">Create a link</div>
                <div className="flex flex-wrap gap-3">
                    <input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="slug (a-z, 0-9, - _)"
                        pattern="[a-z0-9_-]+"
                        required
                        className="flex-1 min-w-48 bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    />
                    <input
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                        type="url"
                        placeholder="https://polyfrost.org/projects/oneclient"
                        required
                        className="flex-2 min-w-80 bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    />
                    <button
                        type="submit"
                        disabled={!password || createMutation.isPending}
                        className="flex items-center gap-2 bg-[#61dafb] text-gray-900 font-semibold px-4 py-2 rounded disabled:opacity-50"
                    >
                        <Plus size={16} />
                        Create
                    </button>
                </div>
                {formError && (
                    <div className="text-sm text-red-300">{formError}</div>
                )}
            </form>

            {error && (
                <div className="bg-red-900/40 border border-red-700 text-red-200 px-4 py-3 rounded">
                    Failed to load links: {(error as Error).message}
                </div>
            )}

            {!data && !error && (
                <div className="text-gray-500">
                    Enter the admin password and press Load.
                </div>
            )}

            {data && (
                <div className="bg-gray-800 rounded-lg shadow-xl overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="px-4 py-3">Slug</th>
                                <th className="px-4 py-3">Share link</th>
                                <th className="px-4 py-3">Target</th>
                                <th className="px-4 py-3 text-right">
                                    Unique visits
                                </th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {links.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-4 text-gray-500"
                                    >
                                        No links yet.
                                    </td>
                                </tr>
                            )}
                            {links.map((link) => (
                                <tr
                                    key={link.slug}
                                    className="border-b border-gray-700/60 last:border-0"
                                >
                                    <td className="px-4 py-3 font-mono text-gray-200">
                                        {link.slug}
                                    </td>
                                    <td className="px-4 py-3">
                                        <CopyButton value={shareUrl(link.slug)} />
                                    </td>
                                    <td className="px-4 py-3 max-w-xs truncate">
                                        <a
                                            href={link.target_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-200"
                                        >
                                            <ExternalLink size={14} />
                                            {link.target_url}
                                        </a>
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold text-gray-100">
                                        {link.clicks.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => {
                                                if (
                                                    confirm(
                                                        `Delete "${link.slug}"? Its visit history is erased.`,
                                                    )
                                                )
                                                    deleteMutation.mutate(
                                                        link.slug,
                                                    );
                                            }}
                                            className="inline-flex items-center gap-1 text-red-400 hover:text-red-300"
                                        >
                                            <Trash2 size={14} />
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
