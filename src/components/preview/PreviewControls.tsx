import { PREVIEW_PULSES, UNSET_CUSTOM_COLOR, hexColor, withCustomColor, type PaletteSlot } from "./manifest";

export const control = "rounded bg-gray-800 px-2 py-1 text-gray-200 hover:bg-gray-700";

export function CustomColorControls({
    slots,
    values,
    bases = {},
    onChange,
}: {
    slots: PaletteSlot[];
    values: Record<string, number>;
    bases?: Record<string, number>;
    onChange: (next: Record<string, number>) => void;
}) {
    if (!slots.length) return null;
    const anySet = slots.some((slot) => slot.id in values);
    return (
        <span className="flex flex-wrap items-center gap-2">
            Custom colors
            {slots.map((slot) => {
                const label = slot.name || slot.id;
                const set = slot.id in values;
                const base = bases[slot.id];
                const shown = set ? values[slot.id] : (base ?? UNSET_CUSTOM_COLOR);
                return (
                    <label key={slot.id} className="flex items-center gap-1">
                        <input
                            type="color"
                            value={hexColor(shown)}
                            onChange={(e) => onChange(withCustomColor(values, slot.id, e.target.value))}
                            aria-label={set ? `${label} color` : `${label} color, not set`}
                            title={set ? undefined : "Not set: uses the designer's color"}
                            className={`h-5 w-6 cursor-pointer rounded bg-transparent p-0 ${
                                set ? "border-0" : "border border-dashed border-gray-400 opacity-60"
                            }`}
                        />
                        {label}
                        {!set && <span className="text-gray-500">(default)</span>}
                        {!set && (
                            <button
                                type="button"
                                onClick={() => onChange(withCustomColor(values, slot.id, hexColor(shown)))}
                                aria-label={`Use this color for ${label}`}
                                className="text-xs text-gray-400 underline hover:text-gray-200"
                            >
                                Use this color
                            </button>
                        )}
                    </label>
                );
            })}
            {anySet && (
                <button type="button" onClick={() => onChange({})} className={control}>
                    Reset colors
                </button>
            )}
        </span>
    );
}

export function PulseButtons({ onPulse }: { onPulse: (event: number) => void }) {
    return (
        <>
            {PREVIEW_PULSES.map(({ label, event }) => (
                <button key={label} type="button" onClick={() => onPulse(event)} className={control}>
                    {label}
                </button>
            ))}
        </>
    );
}
