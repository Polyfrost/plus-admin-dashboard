import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Table, Thumb, secondaryButton } from "@/components/store/shared";
import {
    bonusName,
    cosmeticName,
    equippedRows,
    findCosmetic,
    formatRgb,
    formatTime,
    paletteSwatches,
    privacyLabel,
    type PlayerCatalog,
    type PlayerCosmetics,
} from "@/lib/players-api";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <div>
                <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
                {description && <p className="mt-0.5 max-w-3xl text-sm text-gray-500">{description}</p>}
            </div>
            {children}
        </section>
    );
}

function Swatch({ color }: { color: number }) {
    return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-gray-300">
            <span
                className="inline-block h-4 w-4 rounded border border-gray-600"
                style={{ backgroundColor: formatRgb(color) }}
            />
            {formatRgb(color)}
        </span>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1 rounded-lg bg-gray-800 px-4 py-3">
            <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
            <span className="text-sm text-gray-200">{children}</span>
        </div>
    );
}

export function PlayerDetails({
    player,
    catalog,
    sets,
    refreshing,
    onRefresh,
}: {
    player: PlayerCosmetics;
    catalog: PlayerCatalog | undefined;
    sets: { id: number; name: string }[] | undefined;
    refreshing: boolean;
    onRefresh: () => void;
}) {
    const equipped = equippedRows(player.equipped, catalog);

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-gray-100">
                        {player.username ?? "Unknown name"}
                        {player.live ? <Badge tone="green">online here</Badge> : <Badge>offline here</Badge>}
                    </h2>
                    <p className="mt-1 font-mono text-xs text-gray-500">{player.uuid}</p>
                </div>
                <button onClick={onRefresh} disabled={refreshing} className={secondaryButton}>
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
                    Refresh
                </button>
            </div>

            <Section title="Equipped">
                <Table headers={["Slot", "Cosmetic", "Variant key"]} empty={equipped.length === 0}>
                    {equipped.map((row) => (
                        <tr key={row.slot}>
                            <td className="px-4 py-3 text-gray-400">{row.label}</td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <Thumb cover={row.cosmetic?.cover_url} preview={row.cosmetic?.preview_url} />
                                    <div>
                                        {row.name}
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            #{row.cosmeticId}
                                            {row.cosmetic && !row.cosmetic.enabled && <Badge tone="amber">hidden</Badge>}
                                            {!row.cosmetic && catalog && <Badge tone="red">not in catalog</Badge>}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                {row.variantKey ? (
                                    <span className="font-mono text-xs">{row.variantKey}</span>
                                ) : (
                                    <span className="text-gray-500">None</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </Table>
            </Section>

            <Section title="Settings">
                <div className="grid gap-3 sm:grid-cols-3">
                    <Fact label="Particle color">
                        {player.particle_color == null ? (
                            <span className="text-gray-500">Not set</span>
                        ) : (
                            <Swatch color={player.particle_color} />
                        )}
                    </Fact>
                    <Fact label="Duo emotes">{privacyLabel(player.shared_emote_privacy)}</Fact>
                    <Fact label="Pet interactions">
                        {player.pet_preferences.interactions ? "On" : "Off"}
                        <span className="block text-xs text-gray-500">
                            {player.pet_preferences.updated_at
                                ? `Changed ${formatTime(player.pet_preferences.updated_at)}`
                                : "Never changed"}
                        </span>
                    </Fact>
                </div>
            </Section>

            <Section title="Right now">
                {player.live ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Fact label="Active set bonuses">
                            {player.live.bonuses.length === 0 ? (
                                <span className="text-gray-500">None</span>
                            ) : (
                                <ul className="flex flex-col gap-0.5">
                                    {player.live.bonuses.map((bonus) => (
                                        <li key={bonus.id}>
                                            {bonusName(bonus.id, sets, player.discoveries)}
                                            <span className="ml-2 text-xs text-gray-500">
                                                #{bonus.id}
                                                {bonus.url ? "" : " · no effect file"}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Fact>
                        <Fact label="Playing emote">
                            {player.live.active_emote_id == null ? (
                                <span className="text-gray-500">None</span>
                            ) : (
                                <>
                                    {cosmeticName(catalog, player.live.active_emote_id)}
                                    <span className="ml-2 text-xs text-gray-500">#{player.live.active_emote_id}</span>
                                </>
                            )}
                        </Fact>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">
                        This player isn't connected to this server, so there's no live state to show. Active bonuses
                        and emotes only appear while they're online here.
                    </p>
                )}
            </Section>

            <Section
                title="Custom colors"
                description="Cosmetics this player has recolored. Slots with no saved color use the stock one."
            >
                <Table headers={["Cosmetic", "Status", "Palette"]} empty={player.colors.length === 0}>
                    {player.colors.map((entry) => {
                        const swatches = paletteSwatches(entry, findCosmetic(catalog, entry.cosmetic_id));
                        return (
                            <tr key={entry.cosmetic_id}>
                                <td className="px-4 py-3">
                                    {cosmeticName(catalog, entry.cosmetic_id)}
                                    <div className="text-xs text-gray-500">#{entry.cosmetic_id}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-1">
                                        {entry.active ? (
                                            <Badge tone="green">in use</Badge>
                                        ) : (
                                            <Badge>saved, using stock</Badge>
                                        )}
                                        {entry.aura_default && <Badge tone="blue">default aura color</Badge>}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    {swatches.length === 0 ? (
                                        <span className="text-gray-500">No colors saved</span>
                                    ) : (
                                        <ul className="flex flex-col gap-1">
                                            {swatches.map((swatch) => (
                                                <li key={swatch.name} className="flex items-center gap-3">
                                                    <span className="w-24 truncate text-xs text-gray-400">
                                                        {swatch.name}
                                                    </span>
                                                    {swatch.color == null ? (
                                                        <span className="text-xs text-gray-500">stock</span>
                                                    ) : (
                                                        <Swatch color={swatch.color} />
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </Table>
            </Section>

            <Section
                title="Discovered sets"
                description="Sets this player has completed, with what they were wearing when they found each one."
            >
                <Table
                    headers={["Set", "Wearing", "Discovered", "Told the client"]}
                    empty={player.discoveries.length === 0}
                >
                    {player.discoveries.map((discovery) => (
                        <tr key={discovery.set_id}>
                            <td className="px-4 py-3">
                                {discovery.name}
                                <div className="text-xs text-gray-500">#{discovery.set_id}</div>
                            </td>
                            <td className="max-w-sm px-4 py-3 text-gray-400">
                                <ul className="flex flex-col gap-0.5">
                                    {discovery.cosmetic_ids.map((id) => (
                                        <li key={id} className="truncate">
                                            {cosmeticName(catalog, id)}
                                        </li>
                                    ))}
                                </ul>
                            </td>
                            <td className="px-4 py-3">{formatTime(discovery.discovered_at)}</td>
                            <td className="px-4 py-3">
                                {discovery.delivered_at ? (
                                    formatTime(discovery.delivered_at)
                                ) : (
                                    <Badge tone="amber">not yet</Badge>
                                )}
                            </td>
                        </tr>
                    ))}
                </Table>
            </Section>
        </div>
    );
}
