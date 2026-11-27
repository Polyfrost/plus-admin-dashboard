import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ErrorBanner, Field, inputClass, primaryButton } from "@/components/store/shared";
import { resolvePlayer, usePlayerSend } from "@/lib/players-api";

export function PlayerSearch({ onFound }: { onFound: (uuid: string) => void }) {
    const send = usePlayerSend();
    const [input, setInput] = useState("");
    const lookup = useMutation({
        mutationFn: (value: string) => resolvePlayer(send, value),
        onSuccess: onFound,
    });

    return (
        <div className="flex flex-col gap-3">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    lookup.mutate(input);
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field label="Username or UUID">
                    <input
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="Steve"
                        className={inputClass}
                    />
                </Field>
                <button type="submit" disabled={!input.trim() || lookup.isPending} className={primaryButton}>
                    <Search size={16} />
                    {lookup.isPending ? "Looking up..." : "Look up"}
                </button>
            </form>
            <ErrorBanner error={lookup.error} />
        </div>
    );
}
