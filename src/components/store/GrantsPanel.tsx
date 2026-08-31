import { useMemo, useState } from "react";
import { Gift, Search } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRequiredSession } from "@/lib/session";
import { adminRequest } from "@/lib/store-api";
import {
    ErrorBanner,
    Field,
    Panel,
    PayloadPreview,
    Table,
    inputClass,
} from "./shared";

/**
 * A buyable cosmetic as the catalogue lists it. `id` is the *group* id for a
 * grouped cosmetic, which is not what a grant takes — grants go by variant id,
 * and granting any variant grants the whole group.
 */
interface CosmeticInfo {
    id: number;
    type: string;
    name: string;
    variants: { id: number; name: string }[];
}

interface ResolvedPlayer {
    id: string;
    /** Absent for a UUID nobody has logged in with yet. */
    username?: string;
}

interface GrantResponse {
    granted: number[];
}

/** What one grant did, kept for the session so the page shows its own history. */
interface Receipt {
    player: ResolvedPlayer;
    cosmetic: string;
    granted: number[];
}

export function GrantsPanel() {
    const session = useRequiredSession();
    const [query, setQuery] = useState("");
    const [player, setPlayer] = useState<ResolvedPlayer | null>(null);
    const [variantId, setVariantId] = useState("");
    const [receipts, setReceipts] = useState<Receipt[]>([]);

    const catalog = useQuery({
        queryKey: ["cosmetics", session.env],
        queryFn: () =>
            adminRequest(session, "GET", "/v0/cosmetics") as Promise<{
                cosmetics: CosmeticInfo[];
            }>,
        // Queries are disabled by default so the expensive analytics ones wait
        // for a Load press. The picker is unusable empty, so it loads on open.
        enabled: true,
    });

    // A cosmetic with no variants has no id a grant could use.
    const cosmetics = useMemo(
        () =>
            (catalog.data?.cosmetics ?? []).filter(
                (cosmetic) => cosmetic.variants.length > 0,
            ),
        [catalog.data],
    );

    const selected = cosmetics.find(
        (cosmetic) => String(cosmetic.variants[0].id) === variantId,
    );

    const resolve = useMutation({
        mutationFn: () =>
            adminRequest(
                session,
                "GET",
                `/v1/grants/player/${encodeURIComponent(query.trim())}`,
            ) as Promise<ResolvedPlayer>,
        onSuccess: (resolved) => setPlayer(resolved),
    });

    const body = {
        player: player?.id ?? "",
        cosmetic_id: Number(variantId) || 0,
    };

    const grant = useMutation({
        mutationFn: async () => {
            // Captured here so the receipt describes the grant that was sent,
            // not whatever the form holds once it comes back.
            const target = player;
            const cosmetic = selected;
            if (!target || !cosmetic) {
                throw new Error("Pick a player and a cosmetic first.");
            }

            const result = (await adminRequest(session, "POST", "/v1/grants", {
                player: target.id,
                cosmetic_id: cosmetic.variants[0].id,
            })) as GrantResponse;

            setReceipts((previous) => [
                {
                    player: target,
                    cosmetic: cosmetic.name,
                    granted: result.granted,
                },
                ...previous,
            ]);

            return result;
        },
    });

    return (
        <Panel
            title="Grants"
            description="Hands a player a cosmetic for nothing. Unlike the other tabs this one writes to the plus database rather than PayNow: it books an admin-grant transaction, which is what the Granted column in analytics counts, and pushes the new ownership to the player straight away if they are online. Granting any cosmetic in a group grants the whole group, and nothing here takes a grant back."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    // Enter in the player box means "find them" until it has.
                    if (!player) {
                        resolve.mutate();
                        return;
                    }
                    grant.mutate();
                }}
                className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
            >
                <div className="font-semibold text-gray-300">Grant a cosmetic</div>
                <div className="flex flex-wrap items-end gap-3">
                    <Field
                        label="Player"
                        help="A UUID or a Minecraft username — a name that has never played is looked up at Mojang"
                    >
                        <input
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                // The old answer no longer describes the box.
                                setPlayer(null);
                            }}
                            required
                            placeholder="Notch"
                            className={inputClass}
                        />
                    </Field>
                    <button
                        type="button"
                        onClick={() => resolve.mutate()}
                        disabled={!query.trim() || resolve.isPending}
                        className="flex items-center gap-2 rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:text-gray-100 disabled:opacity-50"
                    >
                        <Search size={14} />
                        {resolve.isPending ? "Finding…" : "Find player"}
                    </button>
                </div>

                {player && (
                    <p className="text-sm text-gray-400">
                        Granting to{" "}
                        <span className="text-gray-200">
                            {player.username ?? "an unnamed player"}
                        </span>{" "}
                        <span className="font-mono text-xs text-gray-500">
                            {player.id}
                        </span>
                        {!player.username && " — they have never logged in"}
                    </p>
                )}

                <Field
                    label="Cosmetic"
                    help={
                        selected && selected.variants.length > 1
                            ? `Grants all ${selected.variants.length} variants`
                            : "Every enabled cosmetic in the catalogue"
                    }
                >
                    <select
                        value={variantId}
                        onChange={(event) => setVariantId(event.target.value)}
                        required
                        disabled={catalog.isPending}
                        className={inputClass}
                    >
                        <option value="">
                            {catalog.isError
                                ? "Cosmetics unavailable"
                                : catalog.isPending
                                  ? "Loading cosmetics…"
                                  : "Pick a cosmetic"}
                        </option>
                        {cosmetics.map((cosmetic) => (
                            <option
                                key={cosmetic.id}
                                value={cosmetic.variants[0].id}
                            >
                                {cosmetic.name} ({cosmetic.type})
                            </option>
                        ))}
                    </select>
                </Field>

                <PayloadPreview body={body} target="the backend" />
                <ErrorBanner
                    error={catalog.error ?? resolve.error ?? grant.error}
                />

                <button
                    type="submit"
                    disabled={!player || !selected || grant.isPending}
                    className="flex w-fit items-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50"
                >
                    <Gift size={16} />
                    {grant.isPending ? "Granting…" : "Grant cosmetic"}
                </button>
            </form>

            <Table
                headers={["Player", "Cosmetic", "Granted"]}
                empty={!receipts.length}
            >
                {receipts.map((receipt, index) => (
                    <tr key={`${receipt.player.id}-${index}`}>
                        <td className="px-4 py-3">
                            {receipt.player.username ?? (
                                <span className="font-mono text-xs">
                                    {receipt.player.id}
                                </span>
                            )}
                        </td>
                        <td className="px-4 py-3">{receipt.cosmetic}</td>
                        <td className="px-4 py-3 text-gray-500">
                            {receipt.granted.length === 1
                                ? "1 cosmetic"
                                : `${receipt.granted.length} cosmetics`}
                        </td>
                    </tr>
                ))}
            </Table>
        </Panel>
    );
}
