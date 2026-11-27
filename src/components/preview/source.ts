import { unzipSync } from "fflate";
import { isJunkPath } from "@/lib/cosmetics-api";

export interface Entry {
    path: string;
    bytes: Uint8Array;
}

export type PreviewSource = string | File[];

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;

const relativePath = (file: File) =>
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

function expand(path: string, bytes: Uint8Array): Entry[] {
    if (!isZip(bytes)) return [{ path, bytes }];
    return Object.entries(unzipSync(bytes))
        .filter(([name]) => !name.endsWith("/"))
        .map(([name, data]) => ({ path: name, bytes: data }));
}

export async function resolveEntries(source: PreviewSource): Promise<Entry[]> {
    if (typeof source === "string") {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`Could not fetch the file (${response.status})`);
        return expand(source.split("?")[0], new Uint8Array(await response.arrayBuffer())).filter((entry) => !isJunkPath(entry.path));
    }
    const all: Entry[] = [];
    for (const file of source) all.push(...expand(relativePath(file), new Uint8Array(await file.arrayBuffer())));
    return all.filter((entry) => !isJunkPath(entry.path));
}

export function bundleFiles(entries: Entry[]): Record<string, Uint8Array> | null {
    const root = entries.find((entry) => entry.path === "manifest.json" || entry.path.endsWith("/manifest.json"));
    if (!root) return null;
    const prefix = root.path.slice(0, root.path.length - "manifest.json".length);
    if (prefix.split("/").length > 2) return null;
    return Object.fromEntries(
        entries.filter((entry) => entry.path.startsWith(prefix)).map((entry) => [entry.path.slice(prefix.length), entry.bytes]),
    );
}

export function blobOf(bytes: Uint8Array, type = ""): Blob {
    return new Blob([bytes as BlobPart], { type });
}
