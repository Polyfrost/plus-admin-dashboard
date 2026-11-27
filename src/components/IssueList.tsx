import { Fragment } from "react";
import { Badge, ErrorBanner } from "@/components/store/shared";
import {
    analysisRows,
    errorIssues,
    errorMessage,
    fixedInBlockbench,
    issueText,
    type BundleAnalysis,
    type Issue,
} from "@/lib/cosmetics-api";

const TONES = { error: "red", warning: "amber", info: "blue" } as const;

export function IssueList({ issues }: { issues: readonly Issue[] }) {
    if (!issues.length) return null;
    return (
        <div className="flex flex-col gap-1">
            <ul className="flex flex-col gap-1 rounded border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm">
                {issues.map((issue, index) => (
                    <li key={index} className="flex flex-wrap items-baseline gap-2">
                        <Badge tone={TONES[issue.level] ?? "gray"}>{issue.level}</Badge>
                        <span className="text-gray-200">{issueText(issue)}</span>
                        {issue.path && <span className="break-all font-mono text-xs text-gray-500">{issue.path}</span>}
                    </li>
                ))}
            </ul>
            {fixedInBlockbench(issues) && (
                <p className="text-xs text-gray-500">
                    These get fixed in Blockbench with the PolyPlus plugin. Any tab or panel named above is in there.
                    Fix it, export the bundle again and pick the new file.
                </p>
            )}
        </div>
    );
}

export function ProblemBanner({ error }: { error: unknown }) {
    if (!error) return null;
    const issues = errorIssues(error);
    return (
        <div className="flex flex-col gap-2">
            <ErrorBanner error={{ message: errorMessage(error) }} />
            <IssueList issues={issues} />
        </div>
    );
}

export function AnalysisTable({ analysis }: { analysis: BundleAnalysis }) {
    return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-0.5 text-xs">
            {analysisRows(analysis).map(([label, value]) => (
                <Fragment key={label}>
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="text-gray-300">{value}</dd>
                </Fragment>
            ))}
        </dl>
    );
}

export function OutcomeNotes({ outcome }: { outcome: { warnings: Issue[]; analysis: BundleAnalysis | null } | null }) {
    if (!outcome || (!outcome.warnings.length && !outcome.analysis)) return null;
    return (
        <div className="flex flex-col gap-2 text-sm">
            {outcome.warnings.length > 0 && (
                <>
                    <span className="text-amber-300">
                        Uploaded with {outcome.warnings.length} warning{outcome.warnings.length === 1 ? "" : "s"}:
                    </span>
                    <IssueList issues={outcome.warnings} />
                </>
            )}
            {outcome.analysis && (
                <>
                    <span className="text-gray-400">Measured by the server:</span>
                    <AnalysisTable analysis={outcome.analysis} />
                </>
            )}
        </div>
    );
}
