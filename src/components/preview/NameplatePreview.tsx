import { useEffect, useRef, useState } from "react";
import { coverPng, frameAt, loadNameplate, nameplateEngine, nameplateKeys, paint, utcFrame, variantOf, type Nameplate } from "./nameplateRaster";
import { bundleFiles, resolveEntries, type PreviewSource } from "./source";

export function NameplatePreview({
    source,
    variantKey = null,
    name = "Player",
    className = "h-72 w-full",
    onVariantKeys,
    onCoverBlob,
}: {
    source: PreviewSource | null;
    variantKey?: string | null;
    name?: string;
    className?: string;
    onVariantKeys?: (keys: string[]) => void;
    onCoverBlob?: (blob: Blob) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [asset, setAsset] = useState<Nameplate | null>(null);
    const [keys, setKeys] = useState<string[]>([]);
    const [picked, setPicked] = useState<string | null>(null);
    const [error, setError] = useState("");
    const shownFrame = useRef<number | null>(null);
    const keysCallback = useRef(onVariantKeys);
    keysCallback.current = onVariantKeys;

    useEffect(() => {
        setError("");
        setAsset(null);
        setKeys([]);
        if (!source || (Array.isArray(source) && !source.length)) return;
        let cancelled = false;
        let loaded: Nameplate | null = null;
        (async () => {
            const [engine, entries] = await Promise.all([nameplateEngine(), resolveEntries(source)]);
            if (cancelled) return;
            const files = bundleFiles(entries);
            if (!files) throw new Error("A nameplate needs a manifest.json");
            loaded = loadNameplate(engine, files);
            const variantKeys = nameplateKeys(loaded);
            setKeys(variantKeys);
            keysCallback.current?.(variantKeys);
            setAsset(loaded);
        })().catch((e) => !cancelled && setError(String(e?.message ?? e)));
        return () => {
            cancelled = true;
            loaded?.free();
        };
    }, [source]);

    const variant = asset ? variantOf(asset, variantKey ?? picked) : 0;

    useEffect(() => {
        if (!asset || !canvas.current) return;
        shownFrame.current = null;
        let shown: number | null = null;
        let frame = 0;
        const tick = () => {
            const index = utcFrame(asset);
            if (index !== shown && canvas.current) {
                shown = index;
                try {
                    paint(canvas.current, frameAt(asset, variant, name, index), name, 4);
                    shownFrame.current = index;
                } catch (e) {
                    setError(String((e as Error)?.message ?? e));
                    return;
                }
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [asset, variant, name]);

    const saveCover = () => {
        if (!asset || !onCoverBlob) return;
        coverPng(asset, variant, name, shownFrame.current ?? undefined).then(onCoverBlob, (e) => setError(String(e?.message ?? e)));
    };

    return (
        <div className="flex flex-col gap-2">
            <div className={`${className} flex items-center justify-center overflow-hidden rounded bg-gray-900`}>
                <canvas ref={canvas} className="max-h-full max-w-full [image-rendering:pixelated]" />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                {keys.length > 1 && variantKey == null && (
                    <label className="flex items-center gap-1">
                        Variant
                        <select
                            value={picked ?? keys[0]}
                            onChange={(e) => setPicked(e.target.value)}
                            className="rounded bg-gray-800 px-1 py-0.5 text-gray-200"
                        >
                            {keys.map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {onCoverBlob && asset && (
                    <button type="button" onClick={saveCover} className="rounded bg-gray-800 px-2 py-1 text-gray-200 hover:bg-gray-700">
                        Save as cover
                    </button>
                )}
                {asset?.textureNote && (
                    <span className={asset.texturesBlank ? "text-amber-300" : "text-gray-400"}>{asset.textureNote}</span>
                )}
                {error && <span className="text-red-300">{error}</span>}
            </div>
        </div>
    );
}
