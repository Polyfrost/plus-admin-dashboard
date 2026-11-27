export type HostTextureKind = "vanilla" | "atlas";

export interface StandInArt {
    width: number;
    height: number;
    rgba: Uint8Array;
}

type Painter = (x: number, y: number) => [number, number, number, number];

const ATLAS_SIZE = 16;
const FNV_OFFSET = 0x811c9dc5 | 0;
const FNV_PRIME = 0x01000193;

const cache = new Map<string, StandInArt>();

function textHash(value: string): number {
    let hash = FNV_OFFSET;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), FNV_PRIME);
    return hash >>> 0;
}

function hash(x: number, y: number, seed: number): number {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x5bd1e995);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 8) / 16777216;
}

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));

function hsv(h: number, s: number, v: number): [number, number, number] {
    const h6 = (h - Math.floor(h)) * 6;
    const i = Math.floor(h6);
    const f = h6 - i;
    const p = v * (1 - s);
    const q = v * (1 - s * f);
    const t = v * (1 - s * (1 - f));
    const rgb = [
        [v, t, p],
        [q, v, p],
        [p, v, t],
        [p, q, v],
        [t, p, v],
        [v, p, q],
    ][i % 6];
    return [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)];
}

const VANILLA: Record<string, { width: number; height: number; paint: Painter }> = {
    end_sky: {
        width: 32,
        height: 32,
        paint: (x, y) => {
            const n = hash(x >> 2, y >> 2, 11) * 0.6 + hash(x, y, 12) * 0.4;
            if (hash(x, y, 13) > 0.97) return [214, 196, 240, 255];
            return [mix(22, 48, n), mix(14, 30, n), mix(34, 66, n), 255];
        },
    },
    end_portal: {
        width: 32,
        height: 32,
        paint: (x, y) => {
            const roll = hash(x, y, 21);
            if (roll > 0.95) return [64, 214, 196, 255];
            if (roll > 0.92) return [152, 108, 230, 255];
            if (roll > 0.9) return [96, 200, 120, 255];
            const n = hash(x >> 3, y >> 3, 22);
            return [mix(6, 14, n), mix(16, 30, n), mix(20, 34, n), 255];
        },
    },
    glint: {
        width: 32,
        height: 32,
        paint: (x, y) => {
            const band = (x + y * 2) % 16;
            const level = band < 4 ? 1 - band / 4 : band > 12 ? (band - 12) / 4 : 0;
            const sparkle = hash(x, y, 31) > 0.93 ? 0.4 : 0;
            const v = Math.min(1, level * 0.8 + sparkle + 0.15);
            return [mix(40, 170, v), mix(10, 90, v), mix(70, 240, v), 255];
        },
    },
    beacon_beam: {
        width: 16,
        height: 32,
        paint: (x, y) => {
            const center = 1 - Math.abs(x - 7.5) / 8;
            const flicker = hash(x, y >> 2, 41) * 0.2;
            const v = Math.min(1, center * 0.9 + flicker);
            return [mix(150, 255, v), mix(200, 255, v), 255, mix(60, 230, v)];
        },
    },
    creeper_armor: {
        width: 32,
        height: 32,
        paint: (x, y) => {
            const zig = (x + Math.abs((y % 8) - 4)) % 10;
            if (zig < 3) return [90, 200, 255, 200];
            if (zig < 4) return [40, 120, 230, 140];
            return [20, 60, 140, 40];
        },
    },
    breeze_wind: {
        width: 32,
        height: 32,
        paint: (x, y) => {
            const wave = Math.round(Math.sin((x / 32) * Math.PI * 4 + (y >> 3)) * 2);
            const line = (y + wave) % 8;
            if (line === 0) return [210, 245, 255, 220];
            if (line === 1) return [150, 215, 240, 120];
            return [120, 180, 220, 20];
        },
    },
};

function fallbackVanilla(name: string): { width: number; height: number; paint: Painter } {
    const hue = (textHash(name) % 360) / 360;
    return {
        width: 16,
        height: 16,
        paint: (x, y) => {
            const [r, g, b] = hsv(hue, 0.5, ((x >> 2) + (y >> 2)) % 2 ? 0.8 : 0.45);
            return [r, g, b, 255];
        },
    };
}

function atlasPainter(sprite: string): Painter {
    const seed = textHash(sprite);
    const hue = (seed % 360) / 360;
    const light = hsv(hue, 0.35, 0.82);
    const dark = hsv(hue, 0.55, 0.5);
    const edge = hsv(hue, 0.6, 0.32);
    return (x, y) => {
        if (x === 0 || y === 0 || x === ATLAS_SIZE - 1 || y === ATLAS_SIZE - 1) return [edge[0], edge[1], edge[2], 255];
        if ((x + y) % 16 < 2) return [255, 255, 255, 255];
        const base = ((x >> 2) + (y >> 2)) % 2 ? light : dark;
        const n = hash(x, y, seed) * 0.12;
        return [mix(base[0], 255, n), mix(base[1], 255, n), mix(base[2], 255, n), 255];
    };
}

function render(width: number, height: number, paint: Painter): StandInArt {
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;
            const [r, g, b, a] = paint(x, y);
            rgba[at] = r;
            rgba[at + 1] = g;
            rgba[at + 2] = b;
            rgba[at + 3] = a;
        }
    }
    return { width, height, rgba };
}

export function standInArt(kind: HostTextureKind, name: string): StandInArt {
    const key = `${kind}:${name}`;
    const known = cache.get(key);
    if (known) return known;
    const art =
        kind === "atlas"
            ? render(ATLAS_SIZE, ATLAS_SIZE, atlasPainter(name))
            : (() => {
                  const spec = VANILLA[name] ?? fallbackVanilla(name);
                  return render(spec.width, spec.height, spec.paint);
              })();
    cache.set(key, art);
    return art;
}
