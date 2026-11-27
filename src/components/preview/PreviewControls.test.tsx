import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { EVENT_EQUIP, EVENT_JUMP } from "@/vendor/plusrenderer/preview.js";
import { CustomColorControls, PulseButtons } from "./PreviewControls";

type Props = { children?: ReactNode; type?: string; value?: string; onChange?: (e: unknown) => void; onClick?: () => void };

function elements(node: ReactNode): ReactElement<Props>[] {
    const found: ReactElement<Props>[] = [];
    const walk = (child: ReactNode) => {
        Children.forEach(child, (item) => {
            if (!isValidElement<Props>(item)) return;
            found.push(item);
            walk(item.props.children);
        });
    };
    walk(node);
    return found;
}

const slots = [
    { id: "fur", name: "Fur" },
    { id: "ribbon", name: "" },
];

describe("custom color controls", () => {
    test("show one picker per customisable slot, named by the designer", () => {
        const html = renderToStaticMarkup(<CustomColorControls slots={slots} values={{ fur: 0x123456 }} onChange={() => {}} />);
        expect(html).toContain("Custom colors");
        expect(html).toContain('aria-label="Fur color"');
        expect(html).toContain('aria-label="ribbon color, not set"');
        expect(html).toContain('value="#123456"');
        expect(html).toContain('value="#ffffff"');
        expect(html).toContain("Reset colors");
    });

    test("render nothing without customisable slots and hide reset until a color is set", () => {
        expect(renderToStaticMarkup(<CustomColorControls slots={[]} values={{}} onChange={() => {}} />)).toBe("");
        expect(renderToStaticMarkup(<CustomColorControls slots={slots} values={{}} onChange={() => {}} />)).not.toContain("Reset");
    });

    test("send picked colors as RGB per slot id and clear them on reset", () => {
        const onChange = vi.fn();
        const tree = elements(CustomColorControls({ slots, values: { fur: 0x112233 }, onChange }));
        const pickers = tree.filter((el) => el.props.type === "color");
        expect(pickers).toHaveLength(2);
        pickers[1].props.onChange!({ target: { value: "#FF8000" } });
        expect(onChange).toHaveBeenLastCalledWith({ fur: 0x112233, ribbon: 0xff8000 });
        tree.find((el) => el.type === "button" && el.props.children === "Reset colors")!.props.onClick!();
        expect(onChange).toHaveBeenLastCalledWith({});
    });
});

describe("unset custom colors", () => {
    const pickers = (values: Record<string, number>, bases: Record<string, number>, onChange = vi.fn()) =>
        elements(CustomColorControls({ slots, values, bases, onChange })).filter((el) => el.props.type === "color");

    test("show the designer's color and say they aren't set", () => {
        const html = renderToStaticMarkup(
            <CustomColorControls slots={slots} values={{ fur: 0x112233 }} bases={{ fur: 0x808080, ribbon: 0xc04020 }} onChange={() => {}} />,
        );
        expect(html).toContain('value="#112233"');
        expect(html).toContain('value="#c04020"');
        expect(html).toContain('aria-label="ribbon color, not set"');
        expect(html).toContain('aria-label="Fur color"');
        expect(html).toContain("(default)");
    });

    const useButtons = (values: Record<string, number>, bases: Record<string, number>, onChange = vi.fn()) =>
        elements(CustomColorControls({ slots, values, bases, onChange })).filter(
            (el) => el.type === "button" && el.props.children === "Use this color",
        );

    test("choosing white on an unset slot commits white, not the designer's color", () => {
        const onChange = vi.fn();
        const [fur] = pickers({}, { fur: 0x808080 }, onChange);
        fur.props.onChange!({ target: { value: "#ffffff" } });
        expect(onChange).toHaveBeenLastCalledWith({ fur: 0xffffff });
    });

    test("use this color pins the shown default, so white and the designer's color stay selectable", () => {
        const onChange = vi.fn();
        const [fur, ribbon] = useButtons({}, { fur: 0x808080 }, onChange);
        fur.props.onClick!();
        expect(onChange).toHaveBeenLastCalledWith({ fur: 0x808080 });
        ribbon.props.onClick!();
        expect(onChange).toHaveBeenLastCalledWith({ ribbon: 0xffffff });
    });

    test("only unset slots offer use this color", () => {
        expect(useButtons({ fur: 0x112233 }, { ribbon: 0xc04020 })).toHaveLength(1);
        expect(useButtons({ fur: 0x112233, ribbon: 0xc04020 }, {})).toHaveLength(0);
    });
});

test("jump and wear-again buttons pulse the engine's events", () => {
    const onPulse = vi.fn();
    const html = renderToStaticMarkup(<PulseButtons onPulse={onPulse} />);
    expect(html).toContain(">Jump<");
    expect(html).toContain(">Wear again<");
    const buttons = elements(PulseButtons({ onPulse })).filter((el) => el.type === "button");
    buttons.forEach((button) => button.props.onClick!());
    expect(onPulse.mock.calls).toEqual([[EVENT_JUMP], [EVENT_EQUIP]]);
});
