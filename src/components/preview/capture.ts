export function captureSquare(source: HTMLCanvasElement): Promise<Blob> {
    const size = Math.min(source.width, source.height);
    const target = document.createElement("canvas");
    target.width = size;
    target.height = size;
    target.getContext("2d")!.drawImage(source, (source.width - size) / 2, (source.height - size) / 2, size, size, 0, 0, size, size);
    return new Promise((resolve, reject) =>
        target.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save the picture"))), "image/png"),
    );
}

const toPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
    new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save the picture"))), "image/png"),
    );

export function captureFitted(source: HTMLCanvasElement, size: number, padding = 0.08): Promise<Blob> {
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, copy.width, copy.height);
    let [left, top, right, bottom] = [width, height, -1, -1];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] === 0) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }
    if (right < 0) throw new Error("The preview came out empty");
    const side = Math.ceil(Math.max(right - left + 1, bottom - top + 1) * (1 + padding * 2));
    const x = (left + right + 1) / 2 - side / 2;
    const y = (top + bottom + 1) / 2 - side / 2;
    const out = Math.min(size, side);
    const target = document.createElement("canvas");
    target.width = out;
    target.height = out;
    const draw = target.getContext("2d")!;
    draw.imageSmoothingQuality = "high";
    draw.drawImage(copy, x, y, side, side, 0, 0, out, out);
    return toPng(target);
}
