import { useMemo, useState } from "react";
import { Gift, Undo2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { adminRequest, cosmeticUnits, useCatalog } from "@/lib/store-api";
import {
    CheckList,
    ErrorBanner,
    Field,
    Panel,
    PayloadPreview,
    Table,
    inputClass,
    primaryButton,
    secondaryButton,
} from "./shared";

interface ResolvedPlayer {
    id: string;
    /** Absent for a UUID nobody has logged in with yet. */
    username?: string;
}

/** What one request did, kept for the session so the page shows its own history. */
interface Receipt {
    action: "Granted" | "Removed";
    players: ResolvedPlayer[];
    cosmetics: string[];
    /** Cosmetic ids the backend reports, groups expanded. */
    count: number;
}

const MAX_PLAYERS = 500;
const MAX_COSMETICS = 100;

export function GrantsPanel() {
    const session = useSession();
    const [players, setPlayers] = useState("");
    const [picked, setPicked] = useState<number[]>([]);
    const [receipts, setReceipts] = useState<Receipt[]>([]);

    const catalog = useCatalog();
    // Grants go by variant id, and any variant stands for its whole group.
    const units = useMemo(() => cosmeticUnits(catalog.data), [catalog.data]);
    const names = new Map(units.map((unit) => [unit.first.id, unit.name]));

    const queries = [
        ...new Set(
            players
                .split(/[\s,]+/)
                .map((line) => line.trim())
                .filter(Boolean),
        ),
    ];

    const run = useMutation({
        mutationFn: async (action: Receipt["action"]) => {
            // Usernames go through the same lookup a single grant used.
            const resolved = await Promise.all(
                queries.map(
                    (query) =>
                        adminRequest(
                            session,
                            "GET",
                            `/v1/admin/grants/player/${encodeURIComponent(query)}`,
                        ) as Promise<ResolvedPlayer>,
                ),
            );
            const body = {
                players: resolved.map((player) => player.id),
                cosmetic_ids: picked,
            };

            let count: number;
            if (action === "Granted") {
                const result = (await adminRequest(
                    session,
                    "POST",
                    "/v1/admin/grants/bulk",
                    body,
                )) as { granted: number[] };
                count = result.granted.length * resolved.length;
            } else {
                const result = (await adminRequest(
                    session,
                    "POST",
                    "/v1/admin/grants/revoke/bulk",
                    body,
                )) as { removed: Record<string, number[]> };
                count = Object.values(result.removed).flat().length;
            }

            setReceipts((previous) => [
                {
                    action,
                    players: resolved,
                    cosmetics: picked.map((id) => names.get(id) ?? `#${id}`),
                    count,
                },
                ...previous,
            ]);
        },
    });

    const tooMany = queries.length > MAX_PLAYERS || picked.length > MAX_COSMETICS;
    const ready = queries.length > 0 && picked.length > 0 && !tooMany && !run.isPending;

    return (
        <Panel
            title="Grants"
            description="Hands players cosmetics for nothing, or takes them away. A grant books an admin-grant transaction, which is what the Granted column in analytics counts. Removing takes a cosmetic away whatever gave it, paid purchases included, and unequips it. Either way online players see it straight away, and any variant stands for its whole group."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    run.mutate("Granted");
                }}
                className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
            >
                <div className="grid gap-3 md:grid-cols-2">
                    <Field
                        label={`Players (${queries.length})`}
                        help={`UUIDs or Minecraft usernames, one per line, up to ${MAX_PLAYERS}. A name that has never played is looked up through Mowojang.`}
                    >
                        <textarea
                            value={players}
                            onChange={(event) => setPlayers(event.target.value)}
                            rows={8}
                            placeholder={"Notch\njeb_"}
                            className={`${inputClass} font-mono text-sm`}
                        />
                    </Field>
                    <Field label="Cosmetics" help={`Up to ${MAX_COSMETICS}`}>
                        <CheckList
                            items={units.map((unit) => ({
                                id: unit.first.id,
                                label: unit.name,
                                hint:
                                    unit.variants.length > 1
                                        ? `${unit.type} · ${unit.variants.length} variants`
                                        : unit.type,
                            }))}
                            selected={picked}
                            onChange={setPicked}
                            empty={
                                catalog.isPending ? "Loading cosmetics…" : "No cosmetics."
                            }
                        />
                    </Field>
                </div>

                <PayloadPreview
                    body={{ players: queries, cosmetic_ids: picked }}
                    target="the backend (usernames resolved to UUIDs first)"
                />
                <ErrorBanner error={catalog.error ?? run.error} />

                <div className="flex gap-3">
                    <button type="submit" disabled={!ready} className={primaryButton}>
                        <Gift size={16} />
                        {run.isPending ? "Working…" : "Grant"}
                    </button>
                    <button
                        type="button"
                        disabled={!ready}
                        onClick={() => {
                            if (
                                confirm(
                                    `Remove ${picked.length} cosmetic(s) from ${queries.length} player(s)? Paid purchases are taken too.`,
                                )
                            ) {
                                run.mutate("Removed");
                            }
                        }}
                        className={secondaryButton}
                    >
                        <Undo2 size={16} />
                        Remove
                    </button>
                </div>
            </form>

            <Table headers={["Action", "Players", "Cosmetics", "Result"]} empty={!receipts.length}>
                {receipts.map((receipt, index) => (
                    <tr key={index}>
                        <td className="px-4 py-3">{receipt.action}</td>
                        <td className="max-w-xs truncate px-4 py-3">
                            {receipt.players
                                .map((player) => player.username ?? player.id)
                                .join(", ")}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3">
                            {receipt.cosmetics.join(", ")}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                            {receipt.count} ownership{receipt.count === 1 ? "" : "s"}
                        </td>
                    </tr>
                ))}
            </Table>
        </Panel>
    );
}
