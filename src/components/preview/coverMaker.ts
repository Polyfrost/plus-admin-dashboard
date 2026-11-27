import { buildSetCoverForm, coverMode, needsManualCover } from "@/lib/cosmetics-api";
import { useAdminMutation, type CatalogCosmetic } from "@/lib/store-api";
import { makeCoverFile } from "./autoCover";

export type CoverMade = "server" | "dashboard";

export function useCoverUpload() {
    return useAdminMutation<{ id: number; file: File; clearPreview?: boolean }>(({ id, file, clearPreview = false }) => ({
        method: "POST",
        path: "/cosmetics/manage/set-cover",
        body: buildSetCoverForm(id, { blob: file, name: file.name }, clearPreview),
    }));
}

export function useCoverMaker() {
    const render = useAdminMutation<{ id: number; seconds: number | null }>(({ id, seconds }) => ({
        method: "POST",
        path: "/cosmetics/manage/render-cover",
        body: { cosmetic_id: id, force: true, ...(seconds !== null && { cover_seconds: seconds }) },
    }));
    const upload = useCoverUpload();

    return async (variant: CatalogCosmetic, seconds: number | null = null): Promise<CoverMade> => {
        if (coverMode(variant.type) === "render") {
            try {
                await render.mutateAsync({ id: variant.id, seconds });
                return "server";
            } catch (error) {
                if (!needsManualCover(error)) throw error;
                render.reset();
            }
        }
        if (!variant.url) throw new Error("It has no file to make a cover from.");
        const file = await makeCoverFile({
            source: variant.url,
            type: variant.type,
            variantKey: variant.variant_key ?? null,
            seconds,
        });
        await upload.mutateAsync({ id: variant.id, file });
        return "dashboard";
    };
}
