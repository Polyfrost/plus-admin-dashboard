import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useStoreList, useStoreMutation } from "@/lib/store-api";
import {
    ErrorBanner,
    Field,
    Panel,
    PayloadPreview,
    Toggle,
    inputClass,
    percentToTenths,
    tenthsToPercent,
} from "./shared";

type CheckoutStyle =
    | "inline"
    | "inline_and_prepayment_dialog"
    | "dedicated_step";

interface UpsellSettings {
    enabled: boolean;
    automatic_recommendations_enabled: boolean;
    automatic_recommendations_discount_type: string;
    automatic_recommendations_discount_amount: number;
    checkout_style: CheckoutStyle;
}

const STYLES: { value: CheckoutStyle; label: string }[] = [
    { value: "inline", label: "Inline" },
    { value: "inline_and_prepayment_dialog", label: "Inline and pre-payment dialog" },
    { value: "dedicated_step", label: "Dedicated step" },
];

export function UpsellsPanel() {
    const settings = useStoreList<UpsellSettings>("upsell-settings");
    const [draft, setDraft] = useState<UpsellSettings | null>(null);

    useEffect(() => {
        if (settings.data) setDraft(settings.data);
    }, [settings.data]);

    const save = useStoreMutation<UpsellSettings>("upsell-settings", (body) => ({
        method: "PATCH",
        path: "",
        body,
    }));

    if (!draft) {
        return (
            <Panel title="Upsells" description="Loading…">
                <ErrorBanner error={settings.error} />
            </Panel>
        );
    }

    const discountPercent = tenthsToPercent(
        draft.automatic_recommendations_discount_amount,
    );

    return (
        <Panel
            title="Upsells"
            description="What PayNow offers alongside the basket. Checkout is hosted by PayNow, so these settings apply to the page buyers are redirected to — nothing in the store or the backend needs to change for them to take effect."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    save.mutate(draft);
                }}
                className="flex max-w-2xl flex-col gap-4 rounded-lg bg-gray-800 p-4 shadow-xl"
            >
                <Toggle
                    label="Upselling enabled"
                    checked={draft.enabled}
                    onChange={(enabled) => setDraft({ ...draft, enabled })}
                />
                <Toggle
                    label="Recommend products automatically"
                    checked={draft.automatic_recommendations_enabled}
                    onChange={(value) =>
                        setDraft({
                            ...draft,
                            automatic_recommendations_enabled: value,
                        })
                    }
                />

                <div className="flex flex-wrap gap-3">
                    <Field label="Checkout style">
                        <select
                            value={draft.checkout_style}
                            onChange={(event) =>
                                setDraft({
                                    ...draft,
                                    checkout_style: event.target
                                        .value as CheckoutStyle,
                                })
                            }
                            className={inputClass}
                        >
                            {STYLES.map((style) => (
                                <option key={style.value} value={style.value}>
                                    {style.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field
                        label="Recommendation discount %"
                        help="A real percentage — 15 takes 15% off the recommendation"
                    >
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={discountPercent}
                            onChange={(event) =>
                                setDraft({
                                    ...draft,
                                    automatic_recommendations_discount_type:
                                        Number(event.target.value) > 0
                                            ? "percentage"
                                            : "none",
                                    automatic_recommendations_discount_amount:
                                        percentToTenths(event.target.value),
                                })
                            }
                            className={inputClass}
                        />
                    </Field>
                </div>

                <PayloadPreview body={draft} />
                <ErrorBanner error={settings.error ?? save.error} />

                <button
                    type="submit"
                    disabled={save.isPending}
                    className="flex w-fit items-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50"
                >
                    <Save size={16} />
                    {save.isPending ? "Saving…" : "Save settings"}
                </button>
                {save.isSuccess && !save.isPending && (
                    <p className="text-sm text-green-300">Saved.</p>
                )}
            </form>
        </Panel>
    );
}
