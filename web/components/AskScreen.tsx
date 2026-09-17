"use client";

import { useEffect, useRef, useState } from "react";
import { askQuestion, type ChatAnswer, type ChatHistoryItem } from "@/lib/api/ai";
import { ApiError } from "@/lib/api/errors";
import { BodyweightErrorAction } from "@/components/BodyweightErrorAction";
import { isBodyweightRequired } from "@/lib/api/bodyweight-events";
import { useCoachInsights } from "@/components/coach/InsightCards";

const STARTER_QUESTIONS = [
  "How much has my bench improved?",
  "When did I last squat 100 kg?",
  "Which muscle groups am I training most?",
  "Have I plateaued anywhere?",
];

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: ChatAnswer["tool_trace"];
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function humanizeToolName(name: string): string {
  const words = name.split("_");
  const rest = words[0] === "get" ? words.slice(1) : words;
  return rest
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function summarizeArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function summarizeResult(result: unknown): string {
  if (Array.isArray(result)) {
    return `${result.length} row${result.length === 1 ? "" : "s"} returned`;
  }
  if (result && typeof result === "object") {
    for (const value of Object.values(result as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        return `${value.length} row${value.length === 1 ? "" : "s"} returned`;
      }
    }
  }
  return "Done";
}

function TraceDetails({ trace }: { trace: ChatAnswer["tool_trace"] }) {
  const [open, setOpen] = useState(false);
  if (trace.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-l-2 border-acid/60 pl-3 pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start text-[11px] font-bold uppercase tracking-[0.14em] text-muted underline decoration-faint underline-offset-4"
      >
        {open ? "Hide data used" : `Data used (${trace.length} tool${trace.length === 1 ? "" : "s"})`}
      </button>
      {open && (
        <ul className="flex flex-col">
          {trace.map((call, index) => {
            const argSummary = summarizeArgs(call.arguments);
            const resultSummary = summarizeResult(call.result);
            const detail = [argSummary, resultSummary].filter(Boolean).join(" · ");
            return (
              <li
                key={`${call.round}-${call.name}-${index}`}
                className="border-b hairline py-2 text-xs"
              >
                <p className="font-bold uppercase tracking-wide">
                  {humanizeToolName(call.name)}
                  <span className="ml-2 font-normal normal-case text-muted">round {call.round}</span>
                </p>
                {detail && <p className="text-muted">{detail}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AskScreen() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBodyweight, setNeedsBodyweight] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { insights, failed: insightsFailed, retry: retryInsights } = useCoachInsights();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, pending]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || pending) return;
    setError(null);
    setPending(true);
    const userTurn: ChatTurn = { id: newId(), role: "user", content: text };
    const history: ChatHistoryItem[] = [...turns, userTurn]
      .slice(-11, -1)
      .map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, userTurn]);
    setDraft("");
    try {
      const answer = await askQuestion(text, history);
      setTurns((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: answer.answer, trace: answer.tool_trace },
      ]);
    } catch (err) {
      if (isBodyweightRequired(err)) {
        setNeedsBodyweight(true);
        setError(err instanceof ApiError ? err.message : "Body weight is needed.");
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't get an answer");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-4 pb-10 pt-4 md:max-w-3xl">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Coach — grounded in your log</p>
        <h1 className="font-display text-[clamp(36px,9vw,60px)] leading-[0.95]">
          Your coach<span className="text-acid">.</span>
        </h1>
      </div>

      {turns.length === 0 && !pending && (
        <section aria-label="Insights from your training" className="flex flex-col gap-2">
          <h2 className="eyebrow border-b hairline pb-2">From your training</h2>
          {insights === null && (
            <div className="flex flex-col gap-2" aria-busy="true">
              <div className="h-16 animate-pulse rounded-[2px] bg-surface-raised" />
              <div className="h-16 animate-pulse rounded-[2px] bg-surface-raised" />
            </div>
          )}
          {insights !== null &&
            insights.map((insight) => (
              <button
                key={insight.title + insight.detail}
                type="button"
                onClick={() => void send(insight.question)}
                className="flex min-h-[68px] w-full items-center gap-3 border-b hairline py-3 text-left"
              >
                <span aria-hidden="true" className="h-8 w-1 shrink-0 bg-acid" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-medium">{insight.title}</span>
                  <span className="truncate text-[13px] text-muted">{insight.detail}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-xs text-muted">
                  Ask →
                </span>
              </button>
            ))}
          {insights !== null && insightsFailed && (
            <button
              type="button"
              onClick={retryInsights}
              className="self-start text-xs font-bold uppercase tracking-[0.14em] text-foreground underline underline-offset-4"
            >
              Retry insights
            </button>
          )}
        </section>
      )}

      {turns.length === 0 && !pending && (
        <div className="flex flex-col gap-1">
          <p className="eyebrow border-b hairline pb-2">Ask anything</p>
          {STARTER_QUESTIONS.map((question, i) => (
            <button
              key={question}
              type="button"
              onClick={() => void send(question)}
              className="group flex min-h-[56px] items-baseline gap-3 border-b hairline py-2.5 text-left"
            >
              <span className="tabular-nums text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 text-[15px] font-normal group-hover:text-acid">{question}</span>
              <span aria-hidden="true" className="text-muted">→</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6" aria-live="polite">
        {turns.map((turn) => {
          if (turn.role === "user") {
            return (
              <div key={turn.id} className="flex flex-col items-end gap-1">
                <p className="max-w-[90%] border hairline bg-surface px-4 py-2.5 text-[15px] font-normal">
                  {turn.content}
                </p>
              </div>
            );
          }
          return (
            <div key={turn.id} className="flex flex-col gap-2 border-t hairline pt-3">
              <p className="eyebrow">Coach · calculated from your log</p>
              <p className="max-w-xl text-[15px] leading-relaxed">{turn.content}</p>
              {turn.trace && <TraceDetails trace={turn.trace} />}
            </div>
          );
        })}
        {pending && (
          <div className="flex items-center gap-2 border-t-2 border-acid/60 pt-3" aria-busy="true">
            <span className="h-2 w-2 animate-pulse bg-acid" />
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Reading your log…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="flex flex-col items-start gap-2 border-l-2 border-danger pl-3" role="alert">
          <p className="text-sm text-danger">{error}</p>
          {needsBodyweight && (
            <BodyweightErrorAction
              onSaved={() => {
                setNeedsBodyweight(false);
                setError(null);
              }}
            />
          )}
        </div>
      )}

      <form
        className="sticky bottom-20 flex gap-2 border-t hairline bg-background pt-3 md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your training…"
          maxLength={2000}
          aria-label="Ask about your training"
          className="h-14 flex-1 rounded-[2px] border hairline bg-sunken px-4 text-base outline-none focus:border-acid"
        />
        <button
          type="submit"
          disabled={!draft.trim() || pending}
          className="slab-press h-14 rounded-[2px] bg-acid px-6 font-display text-lg tracking-wide text-background disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
