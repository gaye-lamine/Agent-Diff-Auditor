"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type RiskLevel = "high" | "medium" | "low" | "unknown";

interface IntentChange {
  filePath: string;
  lineRange: string;
  description: string;
  confidence: "high" | "medium" | "low";
}

interface IntentResult {
  changes: IntentChange[];
  overallIntentMatch: string;
  warnings: string[];
}

interface FileRisk {
  filePath: string;
  riskLevel: RiskLevel;
  justification: string;
  citedLines: string;
}

interface RiskResult {
  fileRisks: FileRisk[];
}

interface OutOfScopeChange {
  filePath: string;
  explanation: string;
}

interface ConsistencyResult {
  canEvaluate: boolean;
  reason: string;
  outOfScopeChanges: OutOfScopeChange[];
}

interface SectionState<T> {
  status: "idle" | "pending" | "fulfilled" | "rejected";
  data?: T;
  error?: string;
}

interface AnalysisState {
  intent: SectionState<IntentResult>;
  risk: SectionState<RiskResult>;
  consistency: SectionState<ConsistencyResult>;
}

interface SuggestedTest {
  filePath: string;
  testCode: string;
  assumptions: string[];
  coversRisk: string;
}

interface SuggestedTestsResult {
  tests: SuggestedTest[];
}

interface ExplainResult {
  explanation: string;
}

interface ExplainSelection {
  selectedCode: string;
  surroundingContext: string;
  filePath: string;
  lineRange: { startLine: number; endLine: number };
  position: { left: number; top: number };
}

const idleAnalysis: AnalysisState = {
  intent: { status: "idle" },
  risk: { status: "idle" },
  consistency: { status: "idle" }
};

const riskBadgeClasses: Record<RiskLevel, string> = {
  low: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  high: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  unknown: "border-slate-500/40 bg-slate-700/50 text-slate-300"
};

function getErrorMessage(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return "The request could not be completed.";
}

async function postAnalysis<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload: unknown = await response.json();

  if (!response.ok) throw new Error(getErrorMessage(payload));
  return payload as T;
}

function toSectionState<T>(result: PromiseSettledResult<T>): SectionState<T> {
  if (result.status === "fulfilled") return { status: "fulfilled", data: result.value };

  return {
    status: "rejected",
    error: result.reason instanceof Error ? result.reason.message : String(result.reason)
  };
}

function extractFilePaths(diff: string): string[] {
  const paths = new Set<string>();

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) paths.add(line.slice(6));
  }

  return [...paths];
}

function validateUnifiedDiff(diff: string): string | null {
  if (!diff.trim()) return "Paste a unified Git diff before starting analysis.";
  if (!/^diff --git a\/.+ b\/.+$/m.test(diff)) {
    return "The input is not a unified Git diff. It must include a 'diff --git' file header.";
  }
  if (!/^--- (?:a\/|\/dev\/null)/m.test(diff) || !/^\+\+\+ (?:b\/|\/dev\/null)/m.test(diff)) {
    return "The diff is incomplete. It must include both --- and +++ file markers.";
  }
  if (!/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(diff)) {
    return "The diff is incomplete. It must include at least one unified-diff hunk header.";
  }

  return null;
}

function filePathAtDiffLine(lines: string[], lineIndex: number): string {
  for (let index = lineIndex; index >= 0; index -= 1) {
    if (lines[index].startsWith("+++ b/")) return lines[index].slice(6);

    if (lines[index].startsWith("diff --git ")) {
      const match = lines[index].match(/^diff --git a\/.+ b\/(.+)$/);
      return match?.[1] ?? "unknown-file";
    }
  }

  return "unknown-file";
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200">
      <code>
        {code.split("\n").map((line, index) => (
          <span
            key={`${index}-${line}`}
            className={`block whitespace-pre ${
              line.trimStart().startsWith("//")
                ? "text-slate-500"
                : /\b(describe|it|test|expect|assert)\b/.test(line)
                  ? "text-sky-200"
                  : /\b(import|from|const|let|return|await)\b/.test(line)
                    ? "text-violet-200"
                    : ""
            }`}
          >
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}

function ErrorMessage({ message }: { message?: string }) {
  return (
    <p className="rounded-md border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
      {message ?? "This analysis could not be completed."}
    </p>
  );
}

export default function HomePage() {
  const [diff, setDiff] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>(idleAnalysis);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tests, setTests] = useState<SectionState<SuggestedTestsResult>>({ status: "idle" });
  const [isSuggestingTests, setIsSuggestingTests] = useState(false);
  const [explainSelection, setExplainSelection] = useState<ExplainSelection | null>(null);
  const [explanation, setExplanation] = useState<SectionState<ExplainResult>>({ status: "idle" });
  const [isExplaining, setIsExplaining] = useState(false);
  const diffPanelRef = useRef<HTMLPreElement>(null);

  const filePaths = useMemo(() => {
    const paths = new Set(extractFilePaths(diff));
    analysis.risk.data?.fileRisks.forEach(({ filePath }) => paths.add(filePath));
    analysis.intent.data?.changes.forEach(({ filePath }) => paths.add(filePath));
    analysis.consistency.data?.outOfScopeChanges.forEach(({ filePath }) => paths.add(filePath));
    return [...paths];
  }, [analysis, diff]);

  const selectedRisk = analysis.risk.data?.fileRisks.find(
    (fileRisk) => fileRisk.filePath === selectedFile
  );
  const selectedChanges =
    analysis.intent.data?.changes.filter((change) => change.filePath === selectedFile) ?? [];
  const selectedOutOfScope =
    analysis.consistency.data?.outOfScopeChanges.filter(
      (change) => change.filePath === selectedFile
    ) ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateUnifiedDiff(diff);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsLoading(true);
    setFormError(null);
    setSelectedFile(null);
    setTests({ status: "idle" });
    setExplainSelection(null);
    setExplanation({ status: "idle" });

    setAnalysis({
      intent: { status: "pending" },
      risk: { status: "pending" },
      consistency: { status: "pending" }
    });
    setSelectedFile(extractFilePaths(diff)[0] ?? null);

    const body = { diff, taskDescription };
    const settle = <T,>(section: keyof AnalysisState, request: Promise<T>) =>
      request.then(
        (data) => {
          setAnalysis((current) => ({ ...current, [section]: { status: "fulfilled", data } }));
          return data;
        },
        (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          setAnalysis((current) => ({ ...current, [section]: { status: "rejected", error: message } }));
          throw error;
        }
      );

    await Promise.allSettled([
      settle("intent", postAnalysis<IntentResult>("/api/analyze-intent", body)),
      settle("risk", postAnalysis<RiskResult>("/api/analyze-risk", body)),
      settle("consistency", postAnalysis<ConsistencyResult>("/api/analyze-consistency", body))
    ]);
    setIsLoading(false);
  }

  async function handleSuggestTests() {
    if (!selectedRisk || !["medium", "high"].includes(selectedRisk.riskLevel)) return;
    setIsSuggestingTests(true);
    setTests({ status: "idle" });
    try {
      const result = await postAnalysis<SuggestedTestsResult>("/api/suggest-tests", {
        diff,
        filePath: selectedRisk.filePath,
        riskLevel: selectedRisk.riskLevel,
        justification: selectedRisk.justification,
        citedLines: selectedRisk.citedLines
      });
      setTests({ status: "fulfilled", data: result });
    } catch (error: unknown) {
      setTests({ status: "rejected", error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSuggestingTests(false);
    }
  }

  function handleDiffMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setExplainSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!diffPanelRef.current?.contains(range.commonAncestorContainer)) return;
    const selectedCode = selection.toString();
    const offset = diff.indexOf(selectedCode);
    if (!selectedCode.trim() || offset < 0) return;
    const lines = diff.split(/\r?\n/);
    const startLine = diff.slice(0, offset).split(/\r?\n/).length;
    const endLine = startLine + selectedCode.split(/\r?\n/).length - 1;
    const rect = range.getBoundingClientRect();
    setExplanation({ status: "idle" });
    setExplainSelection({
      selectedCode,
      surroundingContext: lines.slice(Math.max(0, startLine - 11), Math.min(lines.length, endLine + 10)).join("\n"),
      filePath: filePathAtDiffLine(lines, startLine - 1),
      lineRange: { startLine, endLine },
      position: { left: rect.left, top: rect.bottom + 8 }
    });
  }

  async function handleExplain() {
    if (!explainSelection) return;
    setIsExplaining(true);
    setExplanation({ status: "idle" });
    try {
      const result = await postAnalysis<ExplainResult>("/api/explain", {
        selectedCode: explainSelection.selectedCode,
        surroundingContext: explainSelection.surroundingContext,
        filePath: explainSelection.filePath,
        lineRange: explainSelection.lineRange
      });
      setExplanation({ status: "fulfilled", data: result });
    } catch (error: unknown) {
      setExplanation({ status: "rejected", error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsExplaining(false);
    }
  }

  const hasResults =
    analysis.intent.status !== "idle" ||
    analysis.risk.status !== "idle" ||
    analysis.consistency.status !== "idle";
  const consistencyNeedsAttention =
    analysis.consistency.status === "fulfilled" &&
    (!analysis.consistency.data?.canEvaluate ||
      (analysis.consistency.data?.outOfScopeChanges.length ?? 0) > 0);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex items-end justify-between border-b border-slate-800 pb-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              Code review assistant
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Agent Diff Auditor</h1>
          </div>
          <p className="hidden text-sm text-slate-400 md:block">
            Analyze agent-generated code changes before review.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Unified Git diff</span>
              <textarea
                value={diff}
                onChange={(event) => setDiff(event.target.value)}
                placeholder="Paste a unified Git diff here..."
                className="h-48 w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm leading-6 text-slate-200 outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
              />
            </label>
            <div className="flex flex-col">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">
                  Task description <span className="font-normal text-slate-500">(optional)</span>
                </span>
                <textarea
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                  placeholder="What was the coding agent asked to do?"
                  className="h-32 w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-200 outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                />
              </label>
              <button
                type="submit"
                disabled={isLoading}
                className="mt-auto rounded-md bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isLoading ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </div>
          {isLoading && (
            <p className="mt-4 flex items-center gap-2 text-sm text-sky-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
              Running intent, risk, and consistency analysis…
            </p>
          )}
          {formError && <div className="mt-4"><ErrorMessage message={formError} /></div>}
        </form>

        {hasResults && (
          <section className="mt-8 space-y-6">
            {consistencyNeedsAttention && (
              <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {!analysis.consistency.data?.canEvaluate
                  ? "Consistency analysis is unavailable because no task description was provided."
                  : "Potential out-of-scope changes were detected. Review the file details below."}
              </div>
            )}

            <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Global summary</h2>
                {analysis.intent.data && (
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {analysis.intent.data.overallIntentMatch.replaceAll("_", " ")}
                  </span>
                )}
              </div>
              {analysis.intent.status === "rejected" && <ErrorMessage message={analysis.intent.error} />}
              {analysis.intent.status === "pending" && (
                <p className="text-sm text-sky-200">Intent analysis is still running...</p>
              )}
              {analysis.intent.status === "fulfilled" && (
                <div className="space-y-3">
                  {analysis.intent.data?.changes.length === 0 && (
                    <p className="text-sm text-slate-400">No changes were identified.</p>
                  )}
                  {analysis.intent.data?.changes.map((change, index) => (
                    <div key={`${change.filePath}-${change.lineRange}-${index}`} className="border-l-2 border-sky-400/70 pl-3">
                      <p className="text-sm font-medium text-slate-100">
                        {change.filePath} <span className="font-mono text-slate-400">({change.lineRange})</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-300">{change.description}</p>
                    </div>
                  ))}
                  {(analysis.intent.data?.warnings.length ?? 0) > 0 && (
                    <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                      {analysis.intent.data?.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/60">
              <div className="border-b border-slate-800 px-5 py-4">
                <h2 className="font-semibold">Diff</h2>
                <p className="mt-1 text-sm text-slate-400">Select code to request a focused explanation.</p>
              </div>
              <pre
                ref={diffPanelRef}
                onMouseUp={handleDiffMouseUp}
                className="max-h-[34rem] overflow-auto p-4 font-mono text-xs leading-5 text-slate-300 selection:bg-sky-500/40"
              >
                {diff.split(/\r?\n/).map((line, index) => (
                  <span key={`${index}-${line}`} className="block whitespace-pre">
                    <span className="mr-4 inline-block w-8 select-none text-right text-slate-600">{index + 1}</span>
                    <span className={line.startsWith("+") && !line.startsWith("+++") ? "text-emerald-300" : line.startsWith("-") && !line.startsWith("---") ? "text-rose-300" : ""}>{line}</span>
                  </span>
                ))}
              </pre>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60">
                <div className="border-b border-slate-800 px-5 py-4">
                  <h2 className="font-semibold">Changed files</h2>
                  <p className="mt-1 text-sm text-slate-400">Select a file to inspect the analysis.</p>
                </div>
                {analysis.risk.status === "rejected" && (
                  <div className="p-4"><ErrorMessage message={analysis.risk.error} /></div>
                )}
                {analysis.risk.status === "pending" && (
                  <p className="px-5 py-3 text-sm text-sky-200">Risk analysis is still running...</p>
                )}
                <ul className="divide-y divide-slate-800">
                  {filePaths.map((filePath) => {
                    const risk = analysis.risk.data?.fileRisks.find(
                      (fileRisk) => fileRisk.filePath === filePath
                    );
                    const riskLevel = risk?.riskLevel ?? "unknown";
                    const isSelected = selectedFile === filePath;

                    return (
                      <li key={filePath}>
                        <button
                          type="button"
                          onClick={() => setSelectedFile(filePath)}
                          className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition ${isSelected ? "bg-sky-400/10" : "hover:bg-slate-800/70"}`}
                        >
                          <span className="min-w-0 truncate font-mono text-sm text-slate-200">{filePath}</span>
                          <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold uppercase ${riskBadgeClasses[riskLevel]}`}>
                            {riskLevel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {filePaths.length === 0 && (
                    <li className="px-5 py-6 text-sm text-slate-400">No changed files could be extracted.</li>
                  )}
                </ul>
              </div>

              <aside className="h-fit rounded-lg border border-slate-800 bg-slate-900/60 xl:sticky xl:top-6">
                <div className="border-b border-slate-800 px-5 py-4">
                  <h2 className="font-semibold">{selectedFile ?? "File details"}</h2>
                </div>
                {!selectedFile && <p className="px-5 py-6 text-sm text-slate-400">Select a file to view details.</p>}
                {selectedFile && (
                  <div className="space-y-6 p-5">
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Intent</h3>
                      {analysis.intent.status === "rejected" && <ErrorMessage message={analysis.intent.error} />}
                      {analysis.intent.status === "fulfilled" && selectedChanges.length === 0 && (
                        <p className="text-sm text-slate-400">No intent detail is available for this file.</p>
                      )}
                      <div className="space-y-3">
                        {selectedChanges.map((change, index) => (
                          <div key={`${change.lineRange}-${index}`} className="text-sm">
                            <p className="font-mono text-xs text-sky-300">{change.lineRange}</p>
                            <p className="mt-1 text-slate-200">{change.description}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Risk assessment</h3>
                      {analysis.risk.status === "rejected" && <ErrorMessage message={analysis.risk.error} />}
                      {analysis.risk.status === "pending" && <p className="text-sm text-sky-200">Risk analysis is still running...</p>}
                      {analysis.risk.status === "fulfilled" && !selectedRisk && (
                        <p className="text-sm text-slate-400">No risk detail is available for this file.</p>
                      )}
                      {selectedRisk && (
                        <div className="space-y-3 text-sm">
                          <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold uppercase ${riskBadgeClasses[selectedRisk.riskLevel]}`}>
                            {selectedRisk.riskLevel}
                          </span>
                          <p className="text-slate-200">{selectedRisk.justification}</p>
                          <p className="whitespace-pre-wrap font-mono text-xs leading-5 text-slate-400">{selectedRisk.citedLines}</p>
                          {["medium", "high"].includes(selectedRisk.riskLevel) && (
                            <button
                              type="button"
                              onClick={handleSuggestTests}
                              disabled={isSuggestingTests}
                              className="rounded-md border border-sky-400/50 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSuggestingTests ? "Suggesting tests..." : "Suggest tests"}
                            </button>
                          )}
                        </div>
                      )}
                    </section>

                    {tests.status !== "idle" && (
                      <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Suggested tests</h3>
                        {tests.status === "rejected" && <ErrorMessage message={tests.error} />}
                        {tests.status === "fulfilled" && tests.data?.tests.length === 0 && (
                          <p className="text-sm text-slate-400">No test suggestions were returned.</p>
                        )}
                        <div className="space-y-4">
                          {tests.data?.tests.map((suggestion, index) => (
                            <div key={`${suggestion.filePath}-${index}`} className="space-y-2">
                              <p className="text-sm text-slate-200">{suggestion.coversRisk}</p>
                              <CodeBlock code={suggestion.testCode} />
                              {suggestion.assumptions.length > 0 && (
                                <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
                                  {suggestion.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Consistency</h3>
                      {analysis.consistency.status === "rejected" && <ErrorMessage message={analysis.consistency.error} />}
                      {analysis.consistency.status === "pending" && <p className="text-sm text-sky-200">Consistency analysis is still running...</p>}
                      {analysis.consistency.status === "fulfilled" && selectedOutOfScope.length === 0 && (
                        <p className="text-sm text-slate-400">No out-of-scope change was detected for this file.</p>
                      )}
                      {selectedOutOfScope.map((change) => (
                        <p key={change.explanation} className="text-sm text-amber-100">{change.explanation}</p>
                      ))}
                    </section>
                  </div>
                )}
              </aside>
            </section>
          </section>
        )}
        <footer className="mt-10 border-t border-slate-800 pt-5 text-xs text-slate-500">
          This public demo uses a development model (DeepSeek via NVIDIA NIM). The codebase also supports GPT-5.6 with <span className="font-mono">LLM_PROVIDER=openai</span>.
        </footer>
      </div>
      {explainSelection && (
        <div
          className="fixed z-50 w-80 rounded-md border border-slate-700 bg-slate-900 p-3 shadow-2xl"
          style={{ left: Math.min(explainSelection.position.left, window.innerWidth - 340), top: explainSelection.position.top }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Lines {explainSelection.lineRange.startLine}-{explainSelection.lineRange.endLine}</p>
            <button type="button" onClick={() => setExplainSelection(null)} className="text-xs text-slate-400 hover:text-slate-100">Close</button>
          </div>
          {explanation.status === "idle" && (
            <button type="button" onClick={handleExplain} disabled={isExplaining} className="mt-3 rounded bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-60">
              {isExplaining ? "Explaining..." : "Explain this"}
            </button>
          )}
          {explanation.status === "rejected" && <div className="mt-3"><ErrorMessage message={explanation.error} /></div>}
          {explanation.status === "fulfilled" && <p className="mt-3 text-sm leading-6 text-slate-200">{explanation.data?.explanation}</p>}
        </div>
      )}
    </main>
  );
}
