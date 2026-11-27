import { useEffect, useRef, useState } from "react";
import { Renderer, type Camera } from "@/vendor/plusrenderer/index.js";
import skinUrl from "@/vendor/plusrenderer/skin.png";
import { captureSquare } from "./preview/capture";
import { inspectManifest, type ManifestInfo } from "./preview/manifest";
import { NameplatePreview } from "./preview/NameplatePreview";
import { PendingPreview } from "./preview/PendingPreview";
import { SessionPreview } from "./preview/SessionPreview";
import { blobOf, bundleFiles, resolveEntries } from "./preview/source";

const PLAYER = 0;
const CAPE = 1;
const COSMETIC = 2;

// Same clock as the rAF timestamp passed to `draw`.
const now = () => performance.now() / 1000;

/** A URL to an uploaded asset, or files picked for upload. */
export type PreviewSource = string | File[];

export type PreviewMode = "model" | "nameplate" | "session" | "pending";

export interface PreviewInfo extends Partial<ManifestInfo> {
    mode: PreviewMode;
    variantKeys?: string[];
}

const control = "rounded bg-gray-800 px-2 py-1 text-gray-200 hover:bg-gray-700";

/**
 * Draws a cosmetic, cape or emote on a player with plusrenderer, the same
 * renderer the client uses. Drag to orbit.
 */
export function CosmeticPreview({
    source,
    type,
    bodySlot,
    className = "h-72 w-full",
    frozenAt = null,
    colorway,
    customColors,
    variantKey = null,
    signals,
    coverUrl = null,
    onCoverBlob,
    onInfo,
}: {
    source: PreviewSource | null;
    type: string;
    /** Where a model attaches; ignored for capes and emotes. */
    bodySlot: string;
    className?: string;
    /** Holds the animation at this many seconds in, as a cover is captured. */
    frozenAt?: number | null;
    colorway?: string | null;
    customColors?: Record<string, number>;
    variantKey?: string | null;
    signals?: Record<string, number>;
    coverUrl?: string | null;
    onCoverBlob?: (blob: Blob) => void;
    onInfo?: (info: PreviewInfo) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [renderer, setRenderer] = useState<Renderer | null>(null);
    const [slim, setSlim] = useState(false);
    const [error, setError] = useState("");
    const [mode, setMode] = useState<PreviewMode>(type === "nameplate" ? "nameplate" : "model");
    const [pendingKind, setPendingKind] = useState("");
    const [bundle, setBundle] = useState<{ kind: string; files: Record<string, Uint8Array> } | null>(null);
    const yaw = useRef(30);
    const dragging = useRef<number | null>(null);
    // When the current animation started, on the draw clock; capes run from 0.
    const started = useRef(0);
    const frozen = useRef(frozenAt);
    frozen.current = frozenAt;
    const capture = useRef<((canvas: HTMLCanvasElement) => void) | null>(null);
    const infoCallback = useRef(onInfo);
    infoCallback.current = onInfo;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [created, skin] = await Promise.all([
                Renderer.create(canvas.current!),
                fetch(skinUrl).then((r) => r.blob()).then(createImageBitmap),
            ]);
            if (cancelled) return;
            created.loadPlayer(PLAYER, false);
            created.setTexture(PLAYER, skin);
            setRenderer(created);
        })().catch((e) => !cancelled && setError(String(e?.message ?? e)));

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!renderer || mode !== "model") return;
        let frame = 0;
        let last: number | null = null;
        const draw = (ms: number) => {
            if (!dragging.current && last !== null) yaw.current += ((ms - last) / 1000) * 30;
            last = ms;
            const camera: Camera = { yaw: ((yaw.current + 540) % 360) - 180, pitch: 10, distance: 60, targetY: 18 };
            renderer.draw(
                camera,
                frozen.current == null
                    ? ms / 1000
                    : started.current + frozen.current,
            );
            const take = capture.current;
            if (take) {
                capture.current = null;
                take(renderer.canvas);
            }
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(frame);
            capture.current = null;
        };
    }, [renderer, mode]);

    useEffect(() => {
        const nameplate = type === "nameplate";
        setMode(nameplate ? "nameplate" : "model");
        setBundle(null);
        setError("");
        if (nameplate || !renderer) return;
        let cancelled = false;
        // Reloading the player also drops any emote it was playing.
        renderer.loadPlayer(PLAYER, slim);
        renderer.setVisible(PLAYER, true);
        renderer.clear(CAPE);
        renderer.clear(COSMETIC);
        started.current = 0;
        if (!source || (Array.isArray(source) && !source.length)) return;

        (async () => {
            const entries = await resolveEntries(source);
            if (cancelled) return;

            const files = bundleFiles(entries);
            if (files) {
                const { kind, rig } = inspectManifest(renderer.wasm, files);
                if (cancelled) return;
                const shown = type === "emote" ? "emote" : kind;
                setPendingKind(kind);
                if (shown !== "emote" && shown !== "pet" && rig !== "player") {
                    setMode("pending");
                    setError(`It attaches to a ${rig}, and this preview can only show cosmetics worn by a player.`);
                    infoCallback.current?.({ mode: "pending", kind });
                    return;
                }
                setBundle({ kind: shown, files });
                setMode("session");
                infoCallback.current?.({ mode: "session", kind });
                return;
            }

            infoCallback.current?.({ mode: "model" });
            const [geometry, animation, texture, sheet] = renderer
                .bundleParts(entries.map((e) => e.path))
                .map((i) => entries[i]);

            if (type === "emote" || (animation && !geometry)) {
                if (!animation) throw new Error("No animation (.json) in this emote");
                renderer.loadAnimation(PLAYER, await blobOf(animation.bytes).text());
                started.current = now();
                renderer.play(PLAYER, started.current);
            } else if (geometry) {
                if (!texture) throw new Error("A model needs a .geo.json and a .png");
                renderer.loadCosmetic(
                    COSMETIC,
                    await blobOf(geometry.bytes).text(),
                    bodySlot,
                    await createImageBitmap(blobOf(texture.bytes)),
                );
                if (animation) {
                    renderer.loadAnimation(COSMETIC, await blobOf(animation.bytes).text());
                    started.current = now();
                    renderer.play(COSMETIC, started.current);
                }
            } else if (texture) {
                renderer.loadCape(
                    CAPE,
                    await createImageBitmap(blobOf(texture.bytes)),
                    sheet && (await createImageBitmap(blobOf(sheet.bytes))),
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

    const saveCover = () => {
        if (!onCoverBlob) return;
        capture.current = (target) => {
            captureSquare(target).then(onCoverBlob, (e) => setError(String(e?.message ?? e)));
        };
    };

    return (
        <div className="flex flex-col gap-2">
            {mode === "nameplate" && (
                <NameplatePreview
                    source={source}
                    variantKey={variantKey}
                    className={className}
                    onCoverBlob={onCoverBlob}
                    onVariantKeys={(keys) => infoCallback.current?.({ mode: "nameplate", variantKeys: keys })}
                />
            )}
            {mode === "session" && renderer && bundle && (
                <SessionPreview
                    renderer={renderer}
                    files={bundle.files}
                    kind={bundle.kind}
                    className={className}
                    frozenAt={frozenAt}
                    signals={signals}
                    colorway={colorway}
                    customColors={customColors}
                    onCoverBlob={onCoverBlob}
                    onInfo={(info) => infoCallback.current?.({ mode: "session", ...info })}
                    onUnavailable={(message) => {
                        setMode("pending");
                        setError(message);
                        infoCallback.current?.({ mode: "pending", kind: pendingKind });
                    }}
                />
            )}
            {mode === "pending" && <PendingPreview kind={pendingKind} coverUrl={coverUrl} className={className} />}
            <canvas
                ref={canvas}
                className={`${className} cursor-grab touch-none rounded bg-gray-900 ${mode === "model" ? "" : "hidden"}`}
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
            {mode === "model" && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <label className="flex items-center gap-1">
                        <input
                            type="checkbox"
                            checked={slim}
                            onChange={(e) => setSlim(e.target.checked)}
                            className="accent-[#61dafb]"
                        />
                        Slim
                    </label>
                    {onCoverBlob && (
                        <button type="button" onClick={saveCover} className={control}>
                            Save as cover
                        </button>
                    )}
                    {error && <span className="text-red-300">{error}</span>}
                </div>
            )}
            {(mode === "nameplate" || mode === "pending") && error && <span className="text-xs text-red-300">{error}</span>}
        </div>
    );
}
