import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { useAdminMutation, useAdminQuery } from "@/lib/store-api";
import {
    Badge,
    DeleteButton,
    ErrorBanner,
    Field,
    Panel,
    Table,
    inputClass,
    primaryButton,
} from "@/components/store/shared";

export const Route = createFileRoute("/tokens")({
    component: Tokens,
});

interface TokenInfo {
    id: number;
    label: string;
    exempt_prefixes: string[];
    created_at: string;
    revoked_at: string | null;
}

function Tokens() {
    const tokens = useAdminQuery<TokenInfo[]>("/v1/tokens");
    const revoke = useAdminMutation<number>((id) => ({
        method: "DELETE",
        path: `/v1/tokens/${id}`,
    }));

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <KeyRound size={22} className="text-[#61dafb]" />
                API tokens
            </h1>
            <Panel
                title="Rate limit exemptions"
                description="A token lifts the per-address rate limit on the given path prefixes for a first-party service, sent in the X-Api-Token header. The secret is shown once on creation; a lost token has to be revoked and replaced. Revoking reaches every replica within a minute."
            >
                <CreateToken />
                <ErrorBanner error={tokens.error ?? revoke.error} />
                <Table
                    headers={["Label", "Exempt prefixes", "Created", "Status", ""]}
                    empty={!tokens.isPending && !tokens.data?.length}
                >
                    {tokens.data?.map((token) => (
                        <tr key={token.id}>
                            <td className="px-4 py-3">{token.label}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400">
                                {token.exempt_prefixes.join(", ")}
                            </td>
                            <td className="px-4 py-3 text-gray-400">
                                {new Date(token.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                                {token.revoked_at ? (
                                    <Badge>
                                        revoked{" "}
                                        {new Date(token.revoked_at).toLocaleDateString()}
                                    </Badge>
                                ) : (
                                    <Badge tone="green">active</Badge>
                                )}
                            </td>
                            <td className="px-4 py-3">
                                {!token.revoked_at && (
                                    <DeleteButton
                                        pending={revoke.isPending}
                                        onDelete={() => {
                                            if (confirm(`Revoke "${token.label}"?`)) {
                                                revoke.mutate(token.id);
                                            }
                                        }}
                                    />
                                )}
                            </td>
                        </tr>
                    ))}
                </Table>
            </Panel>
        </div>
    );
}

function CreateToken() {
    const [label, setLabel] = useState("");
    const [prefixes, setPrefixes] = useState("/");
    const [secret, setSecret] = useState<string | null>(null);

    const exempt = prefixes
        .split(",")
        .map((prefix) => prefix.trim())
        .filter(Boolean);
    const create = useAdminMutation<void>(() => ({
        method: "POST",
        path: "/v1/tokens",
        body: { label: label.trim(), exempt_prefixes: exempt },
    }));

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                create.mutate(undefined, {
                    onSuccess: (created) => {
                        setSecret((created as { token: string }).token);
                        setLabel("");
                    },
                });
            }}
            className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
        >
            <div className="font-semibold text-gray-300">Create a token</div>
            <div className="flex flex-wrap gap-3">
                <Field label="Label" help="What it's for, so a stale one is recognisable">
                    <input
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        required
                        placeholder="render-service"
                        className={inputClass}
                    />
                </Field>
                <Field
                    label="Exempt prefixes"
                    help="Comma separated, each starting with /. A lone / exempts everything"
                >
                    <input
                        value={prefixes}
                        onChange={(event) => setPrefixes(event.target.value)}
                        required
                        className={`${inputClass} font-mono`}
                    />
                </Field>
            </div>
            <ErrorBanner error={create.error} />
            {secret && (
                <div className="rounded border border-amber-700 bg-amber-900/30 px-4 py-3 text-sm text-amber-200">
                    Copy this now, it won't be shown again:
                    <code className="mt-2 block select-all break-all font-mono text-amber-100">
                        {secret}
                    </code>
                </div>
            )}
            <button
                type="submit"
                disabled={
                    !label.trim() ||
                    !exempt.length ||
                    !exempt.every((prefix) => prefix.startsWith("/")) ||
                    create.isPending
                }
                className={primaryButton}
            >
                <Plus size={16} />
                {create.isPending ? "Creating…" : "Create token"}
            </button>
        </form>
    );
}
