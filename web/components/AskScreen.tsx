"use client";

import { useEffect, useRef, useState } from "react";
import { askQuestion, type ChatAnswer, type ChatHistoryItem } from "@/lib/api/ai";
import { ApiError } from "@/lib/api/errors";

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

function TraceDetails({ trace }: { trace: ChatAnswer["tool_trace"] }) {
  const [open, setOpen] = useState(false);
  if (trace.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start text-xs text-accent"
      >
        {open ? "Hide data used" : `Data used (${trace.length} tool${trace.length === 1 ? "" : "s"})`}
      </button>
      {open && (
        <ul className="flex flex-col gap-2">
          {trace.map((call, index) => (
            <li key={`${call.round}-${call.name}-${index}`} className="rounded-lg bg-surface p-2 text-xs">
              <p className="font-medium">
                {call.name}
                <span className="ml-2 font-normal text-muted">round {call.round}</span>
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-muted">
                {JSON.stringify({ arguments: call.arguments, result: call.result }, null, 1)}
              </pre>
            </li>
          ))}
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
      setError(err instanceof ApiError ? err.message : "Couldn't get an answer");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-8">
      <h1 className="text-2xl font-semibold">Ask</h1>

      {turns.length === 0 && !pending && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Ask about your logged training. Try one of these:</p>
          {STARTER_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => void send(question)}
              className="rounded-lg border border-border p-3 text-left text-sm"
            >
              {question}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3" aria-live="polite">
        {turns.map((turn) =>
          turn.role === "user" ? (
            <p
              key={turn.id}
              className="self-end rounded-xl rounded-br-sm bg-accent px-4 py-2 text-sm text-white"
            >
              {turn.content}
            </p>
          ) : (
            <div
              key={turn.id}
              className="flex flex-col gap-1 self-start rounded-xl rounded-bl-sm border border-border bg-surface-raised p-3 text-sm"
            >
              <p>{turn.content}</p>
              {turn.trace && <TraceDetails trace={turn.trace} />}
            </div>
          )
        )}
        {pending && (
          <div className="flex gap-1 self-start rounded-xl border border-border bg-surface-raised p-3" aria-busy="true">
            <span className="h-2 w-2 animate-pulse rounded-full bg-muted" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-muted" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-muted" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <form
        className="flex gap-2"
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
          className="h-12 flex-1 rounded-lg border border-border bg-surface px-3 text-base"
        />
        <button
          type="submit"
          disabled={!draft.trim() || pending}
          className="h-12 rounded-lg bg-accent px-5 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
