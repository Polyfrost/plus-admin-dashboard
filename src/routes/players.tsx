import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, UserRound } from "lucide-react";
import { useCatalog } from "@/lib/store-api";
import { useSets } from "@/lib/sets-api";
import { usePlayerCosmetics, type PlayerCatalog } from "@/lib/players-api";
import { ErrorBanner, Panel } from "@/components/store/shared";
import { PlayerSearch } from "@/components/players/PlayerSearch";
import { PlayerDetails } from "@/components/players/PlayerDetails";

export const Route = createFileRoute("/players")({
    component: Players,
    validateSearch: (search: Record<string, unknown>): { uuid?: string } => ({
        uuid: typeof search.uuid === "string" && search.uuid.trim() ? search.uuid.trim() : undefined,
    }),
});

function Players() {
    const { uuid } = Route.useSearch();
    const navigate = Route.useNavigate();
    const player = usePlayerCosmetics(uuid);
    const catalog = useCatalog();
    const sets = useSets();

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <UserRound size={22} className="text-[#61dafb]" />
                Players
            </h1>
            <Panel
                title="Look up a player"
                description="See what a player has equipped, the sets they've found, their custom colors and settings. Nothing here can be changed. The page address includes the player, so you can share it."
            >
                <PlayerSearch onFound={(found) => navigate({ search: { uuid: found } })} />
            </Panel>
            {uuid && (
                <>
                    <ErrorBanner error={player.error} />
                    {catalog.error && (
                        <p className="text-sm text-amber-300">
                            Couldn't load the catalog, so cosmetics show by id only. {catalog.error.message}
                        </p>
                    )}
                    {player.isPending && (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <LoaderCircle size={16} className="animate-spin" />
                            Loading {uuid}
                        </div>
                    )}
                    {player.data && (
                        <PlayerDetails
                            player={player.data}
                            catalog={catalog.data as PlayerCatalog | undefined}
                            sets={sets.data}
                            refreshing={player.isFetching}
                            onRefresh={() => void player.refetch()}
                        />
                    )}
                </>
            )}
        </div>
    );
}
