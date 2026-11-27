import { useEffect, useState } from "react";
import { instantiate } from "@/vendor/plusrenderer/nameplate.js";
import { PreviewPlayer, type EmoteSession } from "@/vendor/plusrenderer/preview.js";
import skinUrl from "@/vendor/plusrenderer/skin.png";
import { coverMode, coverProblems } from "@/lib/cosmetics-api";
import { captureFitted } from "./capture";
import { petOptions } from "./manifest";
import { coverPng, loadNameplate, nameplateEngine, variantOf } from "./nameplateRaster";
import { previewError } from "./SessionPreview";
import { bundleFiles, resolveEntries, type PreviewSource } from "./source";

const STEP = 1 / 30;
const SIZE = 384;
const COVER_SIDE = 512;
const ZOOM_OUT = 1.3;
const FRONT = 30;
const BEHIND = 150;
const WORN_ON_BACK = new Set(["cape", "backpack", "wings"]);
const SETTLE = 0.4;
const AFTER_FIRE = 0.35;
const PET_IDLE = 0.6;
const EMOTE_AT = 1;

export interface CoverRequest {
    source: PreviewSource;
    type: string;
    variantKey?: string | null;
    seconds?: number | null;
}

export const needsDashboardCover = (type: string, hasManifest: boolean) => coverMode(type, hasManifest) === "upload";

let wasm: Promise<WebAssembly.Exports> | null = null;
function sharedWasm() {
    wasm ??= instantiate();
    wasm.catch(() => (wasm = null));
    return wasm;
}

let skin: Promise<ImageBitmap> | null = null;
function sharedSkin() {
    skin ??= fetch(skinUrl).then((r) => r.blob()).then(createImageBitmap);
    skin.catch(() => (skin = null));
    return skin;
}

let queue: Promise<unknown> = Promise.resolve();

export function renderCover(request: CoverRequest): Promise<Blob> {
    const next = queue.then(() => drawCover(request));
    queue = next.catch(() => {});
    return next;
}

export async function makeCoverFile(request: CoverRequest): Promise<File> {
    const file = new File([await renderCover(request)], "auto-cover.png", { type: "image/png" });
    const bitmap = await createImageBitmap(file);
    const problems = coverProblems(file, { width: bitmap.width, height: bitmap.height });
    bitmap.close();
    if (problems.length) throw new Error(problems.join(" "));
    return file;
}

export interface AutoCover {
    file: File | null;
    busy: boolean;
    error: string | null;
}

const IDLE: AutoCover = { file: null, busy: false, error: null };

export function useAutoCover(request: CoverRequest | null, delay = 300): AutoCover {
    const [state, setState] = useState<AutoCover>(() => (request ? { file: null, busy: true, error: null } : IDLE));
    const source = request?.source ?? null;
    const type = request?.type ?? "";
    const variantKey = request?.variantKey ?? null;

    useEffect(() => {
        if (!source) {
            setState(IDLE);
            return;
        }
        let live = true;
        setState({ file: null, busy: true, error: null });
        const timer = setTimeout(() => {
            makeCoverFile({ source, type, variantKey }).then(
                (file) => live && setState({ file, busy: false, error: null }),
                (error: Error) => live && setState({ file: null, busy: false, error: error.message }),
            );
        }, delay);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [source, type, variantKey, delay]);

    return state;
}

const GAME_TEXTURE_COVER = "This nameplate draws game textures, which only show as placeholder art here. Upload a cover made in game or in Blockbench instead.";

async function drawCover({ source, type, variantKey = null, seconds = null }: CoverRequest): Promise<Blob> {
    const entries = await resolveEntries(source);
    const files = bundleFiles(entries);
    if (!files) throw new Error("Only bundles with a manifest.json get a cover made here");
    if (type === "nameplate") {
        const plate = loadNameplate(await nameplateEngine(), files);
        try {
            if (plate.texturesBlank) throw new Error(plate.textureNote ?? "");
            if (plate.standIns.length) throw new Error(GAME_TEXTURE_COVER);
            return await coverPng(plate, variantOf(plate, variantKey));
        } finally {
            plate.free();
        }
    }
    try {
        return await drawScene(files, type, variantKey, seconds);
    } catch (error) {
        throw new Error(previewError(error));
    }
}

async function drawScene(
    files: Record<string, Uint8Array>,
    type: string,
    variantKey: string | null,
    seconds: number | null,
): Promise<Blob> {
    const [exports, image] = await Promise.all([sharedWasm(), sharedSkin()]);
    const canvas = document.createElement("canvas");
    canvas.style.cssText = `position:fixed;left:-${SIZE * 4}px;top:0;width:${SIZE}px;height:${SIZE}px;pointer-events:none;`;
    document.body.appendChild(canvas);
    let time = 0;
    let player: PreviewPlayer | null = null;
    let asset: { free(): void } | null = null;
    try {
        player = await PreviewPlayer.create(canvas, { wasm: exports, clock: () => time, sounds: false, pixelRatio: 2 });
        player.camera.yaw = WORN_ON_BACK.has(type) ? BEHIND : FRONT;
        const run = (seconds: number) => {
            const end = time + seconds;
            while (time < end) {
                time = Math.min(end, time + STEP);
                player!.render();
            }
        };
        const parsed = player.parse(files);
        asset = parsed;
        const kind = parsed.meta()?.kind;
        if (kind === "pet") {
            player.setPlayers([]);
            const pets = player.showPet(parsed, petOptions(parsed.meta(), files, variantKey));
            player.focus();
            if (seconds === null) {
                run(PET_IDLE);
            } else {
                pets.seek(seconds);
                player.render();
            }
        } else if (kind === "emote" || type === "emote") {
            player.setPlayers([{ skin: image }]);
            const session: EmoteSession = player.playEmote(parsed, { loop: false, files });
            player.focus();
            player.render();
            if (seconds === null) {
                run(Number.isFinite(session.length) ? Math.min(EMOTE_AT, session.length / 2) : EMOTE_AT);
                session.pause();
            } else {
                session.seek(seconds);
                player.render();
            }
        } else {
            player.setPlayers([{ skin: image }]);
            const worn = player.wear(parsed);
            const colorway = variantKey ? worn.colorways.indexOf(variantKey) : -1;
            if (colorway >= 0) worn.setColorway(colorway);
            player.focus();
            player.render();
            if (seconds === null) {
                run(SETTLE);
                const effect = worn.namedEffects[0] ?? worn.moments[0]?.name;
                if (effect && player.fire(effect)) run(AFTER_FIRE);
            } else {
                run(seconds);
            }
        }
        player.camera.distance *= ZOOM_OUT;
        player.render();
        return await captureFitted(canvas, COVER_SIDE);
    } finally {
        player?.dispose();
        asset?.free();
        canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
        canvas.remove();
    }
}
