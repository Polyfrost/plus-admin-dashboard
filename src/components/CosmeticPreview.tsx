import { useEffect, useRef, useState } from "react";
import { unzipSync } from "fflate";
import { Renderer } from "@/vendor/plusrenderer/index.js";
import skinUrl from "@/vendor/plusrenderer/skin.png";

const PLAYER = 0;
const CAPE = 1;
const COSMETIC = 2;

// Same clock as the rAF timestamp passed to `draw`.
const now = () => performance.now() / 1000;

export function isMacosJunk(path: string): boolean {
    const segments = path.split("/");
    return segments.at(-1) === ".DS_Store" || segments.includes("__MACOSX");
}

interface Entry {
    path: string;
    blob: Blob;
}

async function expand(path: string, blob: Blob): Promise<Entry[]> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // "PK" — bundles are zips whatever the URL says.
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return [{ path, blob }];
    return Object.entries(unzipSync(bytes))
        .filter(([name]) => !name.endsWith("/"))
        .map(([name, data]) => ({ path: name, blob: new Blob([data as BlobPart]) }));
}

/** A URL to an uploaded asset, or files picked for upload. */
export type PreviewSource = string | File[];

async function resolve(source: PreviewSource): Promise<Entry[]> {
    if (typeof source === "string") {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`Could not fetch the file (${response.status})`);
        return expand(source.split("?")[0], await response.blob());
    }
    const all: Entry[] = [];
    for (const file of source) {
        const path =
            (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        all.push(...(await expand(path, file)));
    }
    return all.filter((entry) => !isMacosJunk(entry.path));
}

/**
 * Draws a cosmetic, cape or emote on a player with plusrenderer, the same
 * renderer the client uses. Drag to orbit.
 */
export function CosmeticPreview({
    source,
    type,
    bodySlot,
    className = "h-72 w-full",
}: {
    source: PreviewSource | null;
    type: string;
    /** Where a model attaches; ignored for capes and emotes. */
    bodySlot: string;
    className?: string;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [renderer, setRenderer] = useState<Renderer | null>(null);
    const [slim, setSlim] = useState(false);
    const [error, setError] = useState("");
    const yaw = useRef(30);
    const dragging = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        let frame = 0;
        (async () => {
            const [created, skin] = await Promise.all([
                Renderer.create(canvas.current!),
                fetch(skinUrl).then((r) => r.blob()).then(createImageBitmap),
            ]);
            if (cancelled) return;
            created.loadPlayer(PLAYER, false);
            created.setTexture(PLAYER, skin);
            setRenderer(created);

            let last = 0;
            const draw = (ms: number) => {
                if (!dragging.current) yaw.current += ((ms - last) / 1000) * 30;
                last = ms;
                created.draw(
                    { yaw: ((yaw.current + 540) % 360) - 180, pitch: 10, distance: 60, targetY: 18 },
                    ms / 1000,
                );
                frame = requestAnimationFrame(draw);
            };
            frame = requestAnimationFrame(draw);
        })().catch((e) => setError(String(e?.message ?? e)));

        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, []);

    useEffect(() => {
        if (!renderer) return;
        let cancelled = false;
        // Reloading the player also drops any emote it was playing.
        renderer.loadPlayer(PLAYER, slim);
        renderer.clear(CAPE);
        renderer.clear(COSMETIC);
        setError("");
        if (!source || (Array.isArray(source) && !source.length)) return;

        (async () => {
            const entries = await resolve(source);
            if (cancelled) return;
            const [geometry, animation, texture, sheet] = renderer
                .bundleParts(entries.map((e) => e.path))
                .map((i) => entries[i]);

            if (type === "emote" || (animation && !geometry)) {
                if (!animation) throw new Error("No animation (.json) in this emote");
                renderer.loadAnimation(PLAYER, await animation.blob.text());
                renderer.play(PLAYER, now());
            } else if (geometry) {
                if (!texture) throw new Error("A model needs a .geo.json and a .png");
                renderer.loadCosmetic(
                    COSMETIC,
                    await geometry.blob.text(),
                    bodySlot,
                    await createImageBitmap(texture.blob),
                );
                if (animation) {
                    renderer.loadAnimation(COSMETIC, await animation.blob.text());
                    renderer.play(COSMETIC, now());
                }
            } else if (texture) {
                renderer.loadCape(
                    CAPE,
                    await createImageBitmap(texture.blob),
                    sheet && (await createImageBitmap(sheet.blob)),
                    sheet?.path ?? "",
                );
            } else {
                throw new Error("Nothing previewable in this file");
            }
        })().catch((e) => !cancelled && setError(String(e?.message ?? e)));

        return () => {
            cancelled = true;
        };
    }, [renderer, source, type, bodySlot, slim]);

    return (
        <div className="flex flex-col gap-2">
            <canvas
                ref={canvas}
                className={`${className} cursor-grab touch-none rounded bg-gray-900`}
                onPointerDown={(e) => {
                    dragging.current = e.clientX;
                    e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerUp={() => (dragging.current = null)}
                onPointerMove={(e) => {
                    if (dragging.current === null) return;
                    yaw.current += (e.clientX - dragging.current) * 0.6;
                    dragging.current = e.clientX;
                }}
            />
            <div className="flex items-center gap-3 text-xs text-gray-500">
                <label className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        checked={slim}
                        onChange={(e) => setSlim(e.target.checked)}
                        className="accent-[#61dafb]"
                    />
                    Slim
                </label>
                {error && <span className="text-red-300">{error}</span>}
            </div>
        </div>
    );
}
