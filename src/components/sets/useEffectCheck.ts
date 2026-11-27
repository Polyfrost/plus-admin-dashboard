import { useEffect, useState } from "react";
import { checkBundle, type BundleReport } from "@/lib/bundle-check";
import type { BundleAnalysis } from "@/lib/cosmetics-api";
import { checkEffectFile } from "@/lib/sets-api";

export interface EffectCheck {
    busy: boolean;
    problem: string | null;
    report: BundleReport | null;
    analysis: BundleAnalysis | null;
    note: string | null;
    blocked: boolean;
}

export function useEffectCheck(file: File | null): EffectCheck {
    const [state, setState] = useState<{ file: File | null; report: BundleReport | null; failed: boolean }>({
        file: null,
        report: null,
        failed: false,
    });
    const problem = file ? checkEffectFile(file) : null;

    useEffect(() => {
        if (!file || problem) return;
        let live = true;
        checkBundle("effect", file).then(
            (report) => live && setState({ file, report, failed: false }),
            () => live && setState({ file, report: null, failed: true }),
        );
        return () => {
            live = false;
        };
    }, [file, problem]);

    const current = state.file === file;
    const busy = !!file && !problem && !current;
    const report = current ? state.report : null;
    const failed = current && state.failed;
    const analysis = report?.analysis && "spring_bones" in report.analysis ? report.analysis : null;
    return {
        busy,
        problem,
        report,
        analysis,
        note: failed ? "The bundle checker didn't load, so only the size was checked." : null,
        blocked: busy || !!problem || report?.status === "invalid",
    };
}
