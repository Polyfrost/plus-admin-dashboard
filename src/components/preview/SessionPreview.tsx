import { useEffect, useMemo, useRef, useState } from "react";
import { CosmeticEngine } from "@/vendor/plusrenderer/cosmetic.js";
import type { Renderer } from "@/vendor/plusrenderer/index.js";
import { startClock } from "@/vendor/plusrenderer/nameplate.js";
import type { RawIssue } from "@/lib/bundle-check";
import {
    PreviewPlayer,
    type EmoteSession,
    type Interaction,
    type PetSession,
    type WornCosmetic,
} from "@/vendor/plusrenderer/preview.js";
import skinUrl from "@/vendor/plusrenderer/skin.png";
import { issueText } from "@/lib/cosmetics-api";
import { captureSquare } from "./capture";
import { CustomColorControls, PulseButtons, control } from "./PreviewControls";
import { HOST_SIGNALS, isToggleSignal, manifestInfo, neutralSignal, paintOf, petOptions, slotBaseColors, type ManifestInfo } from "./manifest";

export const SESSION_KINDS = new Set(["emote", "pet"]);

type Session = EmoteSession | PetSession;
type Pick = Interaction | "auto" | "";

export function previewError(error: unknown): string {
    const issue = (error as { issues?: RawIssue[] } | null)?.issues?.find((i) => i.level === "error");
    if (issue) return issueText(issue);
    const message = String((error as Error | null)?.message ?? error).replace(/^preview: /, "");
    return message.charAt(0).toUpperCase() + message.slice(1);
}

const isPets = (session: Session): session is PetSession => "interactions" in session;

const signalLabel = (name: string) => name.replace(/^is_/, "").replace(/_/g, " ");

export function SessionPreview({
    renderer,
    files,
    kind,
    className,
    frozenAt,
    signals,
    colorway,
    customColors,
    onCoverBlob,
    onInfo,
    onUnavailable,
}: {
    renderer: Renderer;
    files: Record<string, Uint8Array>;
    kind: string;
    className: string;
    frozenAt: number | null;
    signals?: Record<string, number>;
    colorway?: string | null;
    customColors?: Record<string, number>;
    onCoverBlob?: (blob: Blob) => void;
    onInfo?: (info: ManifestInfo) => void;
    onUnavailable: (message: string) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const skin = useRef<ImageBitmap | null>(null);
    const unavailable = useRef(onUnavailable);
    unavailable.current = onUnavailable;
    const infoCallback = useRef(onInfo);
    infoCallback.current = onInfo;
    const [player, setPlayer] = useState<PreviewPlayer | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [worn, setWorn] = useState<WornCosmetic | null>(null);
    const [info, setInfo] = useState<ManifestInfo | null>(null);
    const [error, setError] = useState("");
    const [slim, setSlim] = useState(false);
    const [sound, setSound] = useState(false);
    const [loop, setLoop] = useState(true);
    const [pick, setPick] = useState<Pick>("");
    const [pickedColorway, setPickedColorway] = useState<string | null>(null);
    const [pickedCustom, setPickedCustom] = useState<Record<string, number>>({});
    const [toggled, setToggled] = useState<Record<string, number>>({});
    const clock = useRef<{ held: number | null; shift: number; live: () => number } | null>(null);
    clock.current ??= { held: null, shift: 0, live: startClock() };
    const activeColorway = colorway !== undefined ? colorway : pickedColorway;
    const activeCustom = customColors ?? pickedCustom;
    const customKey = JSON.stringify(activeCustom);
    const slotBases = useMemo(() => slotBaseColors(files, activeColorway), [files, activeColorway]);
    const paintInput = useRef({ colorway: activeColorway, custom: activeCustom });
    paintInput.current = { colorway: activeColorway, custom: activeCustom };

    useEffect(() => {
        let cancelled = false;
        let made: PreviewPlayer | null = null;
        let detach = () => {};
        (async () => {
            const image = await fetch(skinUrl).then((r) => r.blob()).then(createImageBitmap);
            if (cancelled) return;
            const created = await PreviewPlayer.create(canvas.current!, {
                engine: new CosmeticEngine(renderer.wasm),
                clock: () => {
                    const { held, shift, live } = clock.current!;
                    return held ?? live() + shift;
                },
                pixelRatio: 2,
                onError: (e) => setError(previewError(e)),
            });
            if (cancelled) {
                created.dispose();
                return;
            }
            made = created;
            skin.current = image;
            created.muted = true;
            created.camera.yaw = 30;
            detach = created.attachOrbit();
            created.start();
            setPlayer(created);
        })().catch((e) => !cancelled && unavailable.current(previewError(e)));
        return () => {
            cancelled = true;
            detach();
            made?.dispose();
        };
    }, [renderer]);

    useEffect(() => {
        if (!player) return;
        setError("");
        setSession(null);
        setWorn(null);
        setInfo(null);
        setPick("");
        setToggled({});
        let petAsset: { free(): void } | null = null;
        try {
            let meta;
            if (kind === "pet") {
                player.setPlayers([]);
                const parsed = player.parse(files);
                petAsset = parsed;
                const { colorway: picked, custom } = paintInput.current;
                const pets = player.showPet(parsed, petOptions(parsed.meta(), files, picked, custom));
                setSession(pets);
                meta = pets.metas[0];
            } else if (kind === "emote") {
                player.setPlayers([{ skin: skin.current, slim }]);
                const emote = player.playEmote(files, { loop });
                setSession(emote);
                meta = emote.meta;
            } else {
                player.setPlayers([{ skin: skin.current, slim }]);
                const item = player.wear(files);
                setWorn(item);
                meta = item.meta;
            }
            player.focus();
            const found = manifestInfo(meta, files);
            setInfo(found);
            infoCallback.current?.(found);
        } catch (e) {
            setError(previewError(e));
        }
        return () => {
            player.clearEmote();
            player.clearPets();
            player.clearWorn();
            petAsset?.free();
        };
    }, [player, files, kind]);

    useEffect(() => {
        if (player && kind !== "pet") player.setSkin(skin.current, { index: 0, slim });
    }, [player, kind, slim]);

    useEffect(() => {
        if (player) player.muted = !sound;
    }, [player, sound]);

    useEffect(() => {
        if (session) session.loop = loop;
    }, [session, loop]);

    useEffect(() => {
        if (session && isPets(session)) session.setPaint(paintOf(session.metas[0], activeColorway, activeCustom));
        if (!worn) return;
        const paint = paintOf(worn.meta, activeColorway, activeCustom);
        worn.setColorway(paint.colorway);
        worn.setCustom(paint.custom);
    }, [worn, session, activeColorway, customKey]);

    const signalKey = JSON.stringify({ ...signals, ...toggled });
    useEffect(() => {
        player?.setSignals({ ...signals, ...toggled });
    }, [player, signalKey]);

    useEffect(() => {
        if (!session) return;
        if (frozenAt != null) session.seek(frozenAt);
        else if (!session.playing) session.play();
    }, [session, frozenAt]);

    useEffect(() => {
        const held = clock.current!;
        if (!player || !worn || frozenAt == null) {
            if (held.held !== null) {
                held.shift = held.held - held.live();
                held.held = null;
            }
            return;
        }
        held.held = player.clock.now();
        player.setPlayers(player.players.map(({ skin, slim }) => ({ skin, slim })));
        player.render();
        held.held += frozenAt;
    }, [player, worn, frozenAt, slim]);

    const choose = (next: Pick) => {
        if (!player || !session || !isPets(session)) return;
        session.setInteraction(next || null);
        player.focus();
        if (frozenAt != null) session.seek(frozenAt);
        setPick(next);
    };

    const pulse = (event: number) => player?.pulse(event);

    const fire = (name: string) => {
        if (player && !player.fire(name)) setError(`Nothing plays "${name}" here`);
    };

    const saveCover = () => {
        if (!player || !onCoverBlob) return;
        player.render();
        captureSquare(player.canvas).then(onCoverBlob, (e) => setError(previewError(e)));
    };

    const signalValue = (name: string) => toggled[name] ?? signals?.[name] ?? neutralSignal(name);
    const setSignal = (name: string, value: number) => setToggled((all) => ({ ...all, [name]: value }));
    const signalControl = (name: string) =>
        isToggleSignal(name) ? (
            <label key={name} className="flex items-center gap-1">
                <input
                    type="checkbox"
                    checked={signalValue(name) > 0}
                    onChange={(e) => setSignal(name, e.target.checked ? 1 : 0)}
                    className="accent-[#61dafb]"
                />
                {signalLabel(name)}
            </label>
        ) : (
            <label key={name} className="flex items-center gap-1">
                {signalLabel(name)}
                <input
                    type="number"
                    step={0.1}
                    value={signalValue(name)}
                    onChange={(e) => setSignal(name, Number(e.target.value) || 0)}
                    className="w-16 rounded bg-gray-800 px-1 py-0.5 text-gray-200"
                />
            </label>
        );
    const readSignals = info?.signals ?? [];
    const otherSignals = HOST_SIGNALS.filter((name) => !readSignals.includes(name));

    const pets = session && isPets(session) ? session : null;
    const timed = session && (Number.isFinite(session.length) || ("known" in session && Number.isFinite(session.known)));

    return (
        <div className="flex flex-col gap-2">
            <canvas ref={canvas} className={`${className} cursor-grab touch-none rounded bg-gray-900`} />
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                {session && timed && <Transport session={session} length={Number.isFinite(session.length) ? session.length : 0} />}
                {session && !pets && (
                    <label className="flex items-center gap-1">
                        <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="accent-[#61dafb]" />
                        Loop
                    </label>
                )}
                {pets && (
                    <label className="flex items-center gap-1">
                        Interaction
                        <select
                            value={pick}
                            onChange={(e) => choose(e.target.value as Pick)}
                            className="rounded bg-gray-800 px-1 py-0.5 text-gray-200"
                        >
                            <option value="">Idle</option>
                            <option value="auto">Auto</option>
                            {pets.interactions.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                        {pick === "auto" && <span>{pets.interaction ? `picked ${pets.interaction}` : "nothing fits"}</span>}
                    </label>
                )}
                {kind !== "pet" && (
                    <label className="flex items-center gap-1">
                        <input type="checkbox" checked={slim} onChange={(e) => setSlim(e.target.checked)} className="accent-[#61dafb]" />
                        Slim
                    </label>
                )}
                {(worn || pets) && info && info.colorways.length > 0 && colorway === undefined && (
                    <label className="flex items-center gap-1">
                        Colorway
                        <select
                            value={pickedColorway ?? ""}
                            onChange={(e) => setPickedColorway(e.target.value || null)}
                            className="rounded bg-gray-800 px-1 py-0.5 text-gray-200"
                        >
                            <option value="">Default</option>
                            {info.colorways.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {(worn || pets) && info && customColors === undefined && (
                    <CustomColorControls
                        slots={info.customSlots}
                        values={pickedCustom}
                        bases={slotBases}
                        onChange={setPickedCustom}
                    />
                )}
                <label className="flex items-center gap-1">
                    <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="accent-[#61dafb]" />
                    Sound
                </label>
                {info && <PulseButtons onPulse={pulse} />}
                {readSignals.map(signalControl)}
                {info?.effects.map((name) => (
                    <button key={name} type="button" onClick={() => fire(name)} className={control}>
                        Play {name}
                    </button>
                ))}
                {onCoverBlob && (
                    <button type="button" onClick={saveCover} className={control}>
                        Save as cover
                    </button>
                )}
                {error && <span className="text-red-300">{error}</span>}
            </div>
            {info && (
                <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer select-none">
                        {readSignals.length ? "More signals" : "Signals"}
                    </summary>
                    <div className="mt-2 flex flex-wrap items-center gap-3">{otherSignals.map(signalControl)}</div>
                </details>
            )}
        </div>
    );
}

function Transport({ session, length }: { session: Session; length: number }) {
    const range = useRef<HTMLInputElement>(null);
    const clock = useRef<HTMLSpanElement>(null);
    const [playing, setPlaying] = useState(session.playing);

    useEffect(() => {
        let frame = 0;
        const tick = () => {
            setPlaying(session.playing);
            const input = range.current;
            const span = "known" in session ? Math.max(length, session.known) : length;
            if (input && input.max !== String(span)) input.max = String(span);
            if (input && document.activeElement !== input) input.value = String(session.time);
            if (clock.current) clock.current.textContent = `${session.time.toFixed(2)} / ${span.toFixed(2)} s`;
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [session, length]);

    return (
        <>
            <button type="button" onClick={() => (playing ? session.pause() : session.play())} className={control}>
                {playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => session.restart()} className={control}>
                Restart
            </button>
            <input
                ref={range}
                type="range"
                min={0}
                max={length}
                step={0.01}
                defaultValue={0}
                onInput={(e) => session.seek(Number(e.currentTarget.value))}
                aria-label="Time"
                className="w-40 accent-[#61dafb]"
            />
            <span ref={clock} className="tabular-nums" />
        </>
    );
}
