import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { zipSync } from "fflate";

export const Route = createFileRoute("/")({
    component: Dashboard,
});

interface Variant {
    id: number;
    name: string;
    model?: string;
    url?: string;
    hash: string;
}

// A buyable cosmetic. Owns one or more variants the player chooses between.
interface Cosmetic {
    id: number;
    type: string;
    name: string;
    allowed_slots: string[];
    variants: Variant[];
}

const COSMETIC_TYPES = [
    "cape",
    "backpack",
    "glasses",
    "wings",
    "glove",
    "hat",
    "aura",
    "boots",
    "shoulder",
] as const;
type CosmeticType = (typeof COSMETIC_TYPES)[number];

const UPLOAD_TYPES = [...COSMETIC_TYPES, "emote"] as const;
type UploadType = (typeof UPLOAD_TYPES)[number];

const BODY_SLOTS = [
    "cape",
    "backpack",
    "glasses",
    "wings",
    "left_hand",
    "right_hand",
    "hat",
    "aura",
    "boots",
    "shoulder",
] as const;
type BodySlot = (typeof BODY_SLOTS)[number];

const DEFAULT_SLOTS: Record<CosmeticType, BodySlot[]> = {
    cape: ["cape"],
    backpack: ["backpack"],
    glasses: ["glasses"],
    wings: ["wings"],
    glove: ["left_hand", "right_hand"],
    hat: ["hat"],
    aura: ["aura"],
    boots: ["boots"],
    shoulder: ["shoulder"],
};

function isBundleUrl(url: string): boolean {
    return url.split("?")[0].toLowerCase().endsWith(".zip");
}

function assetFormat(url: string): string {
    const path = url.split("?")[0];
    const dot = path.lastIndexOf(".");
    return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function isMacosJunk(relativePath: string): boolean {
    const segments = relativePath.split("/");
    return (
        segments[segments.length - 1] === ".DS_Store" ||
        segments.includes("__MACOSX")
    );
}

async function buildBundle(files: File[]): Promise<Uint8Array> {
    const entries: Record<string, Uint8Array> = {};
    for (const f of files) {
        const rel =
            (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
            f.name;
        if (isMacosJunk(rel)) continue;
        const segments = rel.split("/");
        const inner =
            segments.length > 1 ? segments.slice(1).join("/") : rel;
        entries[inner] = new Uint8Array(await f.arrayBuffer());
    }
    return zipSync(entries);
}

function Dashboard() {
    const [password, setPassword] = useState("");
    const [env, setEnv] = useState("http://127.0.0.1:8080");
    const [file, setFile] = useState<File | null>(null);
    const [folderFiles, setFolderFiles] = useState<File[]>([]);
    const [type, setType] = useState<UploadType>("cape");
    const [name, setName] = useState("");
    const [slots, setSlots] = useState<BodySlot[]>(DEFAULT_SLOTS.cape);
    // Variant grouping: when `group` is set, this upload becomes a variant of
    // that group (find-or-created by the backend) so players buy it once and
    // choose between variants. All optional.
    const [group, setGroup] = useState("");
    const [variantName, setVariantName] = useState("");
    const [modelVariant, setModelVariant] = useState("");
    const [variantOrder, setVariantOrder] = useState("");
    const [message, setMessage] = useState("");
    const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
    const [typeFilter, setTypeFilter] = useState<string>("all");

    const isEmote = type === "emote";

    const onTypeChange = (next: UploadType) => {
        setType(next);
        // Reset slots to the new type's defaults; admin can re-adjust. Emotes
        // have no body slots.
        if (next !== "emote") {
            setSlots(DEFAULT_SLOTS[next]);
        }
    };

    const toggleSlot = (slot: BodySlot) => {
        setSlots((prev) =>
            prev.includes(slot)
                ? prev.filter((s) => s !== slot)
                : [...prev, slot],
        );
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password || (!file && folderFiles.length === 0)) {
            setMessage("Provide a password and a file or folder.");
            return;
        }
        if (!isEmote && slots.length === 0) {
            setMessage("Select at least one body slot.");
            return;
        }

        setMessage("Uploading...");
        const formData = new FormData();

        if (folderFiles.length > 0) {
            const zipped = await buildBundle(folderFiles);
            formData.append(
                "file",
                new Blob([zipped as BlobPart], { type: "application/zip" }),
                "bundle.zip",
            );
        } else if (file) {
            formData.append("file", file, file.name);
        }

        if (name.trim()) {
            formData.append("name", name.trim());
        }
        if (!isEmote) {
            formData.append("type", type);
            for (const slot of slots) {
                formData.append("slots", slot);
            }
            if (group.trim()) formData.append("group", group.trim());
            if (variantName.trim())
                formData.append("variant_name", variantName.trim());
            if (modelVariant.trim())
                formData.append("model_variant", modelVariant.trim());
            if (variantOrder.trim())
                formData.append("variant_order", variantOrder.trim());
        }

        const endpoint = isEmote
            ? `${env}/cosmetics/emote`
            : `${env}/cosmetics/upload`;

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    Authorization: password,
                },
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                setMessage(`Uploaded successfully! ID: ${data.id}`);
            } else {
                const text = await res.text();
                setMessage(`Error: ${res.status} ${text}`);
            }
        } catch (err) {
            setMessage(`Network error: ${err}`);
        }
    };

    const fetchCosmetics = async () => {
        try {
            const res = await fetch(`${env}/cosmetics`);
            if (res.ok) {
                const data = await res.json();
                console.log(data.cosmetics);
                setCosmetics(data.cosmetics);
            } else {
                setMessage(`Error fetching cosmetics: ${res.status}`);
            }
        } catch (err) {
            setMessage(`Network error: ${err}`);
        }
    };

    return (
        <div className="min-h-screen bg-[#282c34] text-white flex flex-col items-center py-10">
            <h1 className="text-3xl font-bold mb-8">PolyPlus Admin</h1>

            <form
                onSubmit={handleUpload}
                className="flex flex-col gap-4 w-full max-w-md bg-gray-800 p-6 rounded-lg shadow-xl"
            >
                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Environment
                    </label>
                    <select
                        value={env}
                        onChange={(e) => setEnv(e.target.value)}
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    >
                        <option value="http://127.0.0.1:8080">
                            Local (127.0.0.1:8080)
                        </option>
                        <option value="https://plus-staging.polyfrost.org">
                            Staging
                        </option>
                        <option value="https://plus.polyfrost.org">
                            Production
                        </option>
                    </select>
                </div>

                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Admin Password
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                        placeholder="Enter password"
                    />
                </div>

                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Cosmetic Type
                    </label>
                    <select
                        value={type}
                        onChange={(e) =>
                            onTypeChange(e.target.value as UploadType)
                        }
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    >
                        {UPLOAD_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Display Name{" "}
                        <span className="text-gray-500">(optional)</span>
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                        placeholder={`Defaults to "${type}"`}
                    />
                </div>

                {!isEmote && (
                    <div className="flex flex-col">
                        <label className="mb-1 text-sm text-gray-300">
                            Allowed Slots
                        </label>
                        <div className="flex flex-wrap gap-3 p-2 rounded bg-gray-700 border border-gray-600">
                            {BODY_SLOTS.map((slot) => (
                                <label
                                    key={slot}
                                    className="flex items-center gap-1 text-sm cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={slots.includes(slot)}
                                        onChange={() => toggleSlot(slot)}
                                    />
                                    {slot}
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {!isEmote && (
                    <div className="flex flex-col gap-3 p-3 rounded bg-gray-700/50 border border-gray-600">
                        <span className="text-sm text-gray-300">
                            Variant grouping{" "}
                            <span className="text-gray-500">
                                (optional — leave Group blank for a standalone
                                cosmetic)
                            </span>
                        </span>
                        <div className="flex flex-col">
                            <label className="mb-1 text-xs text-gray-400">
                                Group
                            </label>
                            <input
                                type="text"
                                value={group}
                                onChange={(e) => setGroup(e.target.value)}
                                className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                                placeholder={`e.g. "Pride Cape", "Cat Ears"`}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="mb-1 text-xs text-gray-400">
                                Variant Name
                            </label>
                            <input
                                type="text"
                                value={variantName}
                                onChange={(e) => setVariantName(e.target.value)}
                                className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                                placeholder={`e.g. "Blue", "Left Silver"`}
                            />
                        </div>
                        <div className="flex gap-3">
                            <div className="flex flex-col flex-1">
                                <label className="mb-1 text-xs text-gray-400">
                                    Model{" "}
                                    <span className="text-gray-500">
                                        (slim/wide)
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    value={modelVariant}
                                    onChange={(e) =>
                                        setModelVariant(e.target.value)
                                    }
                                    className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                                    placeholder="(blank for most)"
                                />
                            </div>
                            <div className="flex flex-col w-24">
                                <label className="mb-1 text-xs text-gray-400">
                                    Order
                                </label>
                                <input
                                    type="number"
                                    value={variantOrder}
                                    onChange={(e) =>
                                        setVariantOrder(e.target.value)
                                    }
                                    className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        <span className="text-xs text-gray-500">
                            Order sets where this variant appears within its
                            group (lowest first; ties broken by ID). Leave 0 to
                            order by upload. For slim/wide pairs of the same
                            choice, give both the same order to keep them
                            together.
                        </span>
                    </div>
                )}

                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Single File{" "}
                        <span className="text-gray-500">
                            (image, or a pre-made .zip)
                        </span>
                    </label>
                    <input
                        type="file"
                        onChange={(e) => {
                            setFile(e.target.files?.[0] || null);
                            if (e.target.files?.[0]) setFolderFiles([]);
                        }}
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    />
                </div>

                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Or Folder{" "}
                        <span className="text-gray-500">
                            (multi-file, zipped in-browser; .DS_Store ignored)
                        </span>
                    </label>
                    <input
                        type="file"
                        multiple
                        ref={(el) => {
                            if (el) el.setAttribute("webkitdirectory", "");
                        }}
                        onChange={(e) => {
                            const picked = Array.from(e.target.files ?? []);
                            setFolderFiles(picked);
                            if (picked.length) setFile(null);
                        }}
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    />
                    {folderFiles.length > 0 && (
                        <span className="mt-1 text-xs text-gray-400">
                            {
                                folderFiles.filter(
                                    (f) =>
                                        !isMacosJunk(
                                            (
                                                f as File & {
                                                    webkitRelativePath?: string;
                                                }
                                            ).webkitRelativePath || f.name,
                                        ),
                                ).length
                            }{" "}
                            file(s) will be bundled
                        </span>
                    )}
                </div>

                <button
                    type="submit"
                    className="mt-4 bg-[#61dafb] text-gray-900 font-bold py-2 rounded hover:bg-[#4fa8c7] transition-colors"
                >
                    {isEmote ? "Upload Emote" : "Upload Cosmetic"}
                </button>

                {message && (
                    <div className="mt-4 p-3 bg-gray-700 rounded text-center text-sm break-words">
                        {message}
                    </div>
                )}
            </form>

            <div className="w-full max-w-4xl mt-12 px-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Available Cosmetics</h2>
                    <div className="flex items-center gap-3">
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                        >
                            <option value="all">All types</option>
                            {COSMETIC_TYPES.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={fetchCosmetics}
                            className="bg-[#61dafb] text-gray-900 font-bold py-2 px-4 rounded hover:bg-[#4fa8c7] transition-colors"
                        >
                            Load Cosmetics
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {cosmetics
                        ?.filter(
                            (cosmetic) =>
                                typeFilter === "all" ||
                                cosmetic.type === typeFilter,
                        )
                        .map((cosmetic) => (
                            <div
                                key={cosmetic.id}
                                className="bg-gray-800 p-4 rounded-lg shadow-xl flex flex-col"
                            >
                                <div className="flex justify-between items-start mb-1 gap-2">
                                    <span
                                        className="font-bold truncate"
                                        title={cosmetic.name}
                                    >
                                        {cosmetic.name || "(unnamed)"}
                                    </span>
                                    <span className="shrink-0 text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">
                                        {cosmetic.type}
                                    </span>
                                </div>

                                <div className="mb-3 text-[11px] text-gray-400 flex flex-wrap gap-x-2">
                                    <span className="font-mono">
                                        #{cosmetic.id}
                                    </span>
                                    <span>
                                        ·{" "}
                                        {cosmetic.allowed_slots?.join(", ") ||
                                            "no slots"}
                                    </span>
                                    <span>
                                        ·{" "}
                                        {cosmetic.variants?.length ?? 0} variant
                                        {(cosmetic.variants?.length ?? 0) === 1
                                            ? ""
                                            : "s"}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {cosmetic.variants?.map((variant) => (
                                        <div
                                            key={variant.id}
                                            className="bg-gray-900/60 rounded p-2 flex flex-col gap-1.5"
                                        >
                                            <div className="flex justify-between items-center gap-2 text-xs">
                                                <span
                                                    className="font-semibold truncate"
                                                    title={variant.name}
                                                >
                                                    {variant.name}
                                                </span>
                                                {variant.model && (
                                                    <span className="shrink-0 bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">
                                                        {variant.model}
                                                    </span>
                                                )}
                                            </div>

                                            {variant.url &&
                                            isBundleUrl(variant.url) ? (
                                                <a
                                                    href={variant.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="aspect-video bg-gray-900 rounded flex flex-col items-center justify-center text-gray-400 text-sm gap-1 hover:text-[#61dafb]"
                                                >
                                                    <span className="text-2xl">
                                                        📦
                                                    </span>
                                                    Bundle (.zip) — download
                                                </a>
                                            ) : variant.url ? (
                                                <div className="aspect-video bg-gray-900 rounded overflow-hidden flex items-center justify-center">
                                                    <img
                                                        src={variant.url}
                                                        alt={`Variant ${variant.id}`}
                                                        className="max-w-full max-h-full object-contain cursor-pointer"
                                                        title="Click to copy URL"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(
                                                                variant.url!,
                                                            );
                                                            setMessage(
                                                                `Copied URL for #${variant.id}`,
                                                            );
                                                        }}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="aspect-video bg-gray-900 rounded flex items-center justify-center text-gray-500 text-sm">
                                                    No Preview
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-1 text-xs">
                                                <div className="flex justify-between text-gray-400">
                                                    <span>ID</span>
                                                    <span className="font-mono text-gray-300">
                                                        #{variant.id}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-gray-400">
                                                    <span>Format</span>
                                                    <span className="font-mono text-gray-300 uppercase">
                                                        {variant.url
                                                            ? assetFormat(
                                                                  variant.url,
                                                              ) || "—"
                                                            : "—"}
                                                    </span>
                                                </div>
                                                <div
                                                    className="flex justify-between gap-2 text-gray-400 cursor-pointer hover:text-[#61dafb]"
                                                    title={`${variant.hash}\n(click to copy)`}
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(
                                                            variant.hash,
                                                        );
                                                        setMessage(
                                                            `Copied hash for #${variant.id}`,
                                                        );
                                                    }}
                                                >
                                                    <span>Hash</span>
                                                    <span className="font-mono truncate max-w-[60%]">
                                                        {variant.hash}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
}
