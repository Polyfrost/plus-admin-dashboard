export function PendingPreview({ kind, coverUrl, className }: { kind: string; coverUrl?: string | null; className: string }) {
    const what = kind === "pet" ? "Pets" : kind === "emote" ? "Emotes" : "This bundle";
    return (
        <div className={`${className} flex flex-col items-center justify-center gap-2 rounded bg-gray-900 p-4 text-center text-xs text-gray-400`}>
            {coverUrl && <img src={coverUrl} alt="Cover" className="min-h-0 flex-1 object-contain" />}
            <p>
                {what} can't be previewed in this browser.
                {coverUrl ? " This is the cover." : ""}
            </p>
        </div>
    );
}
