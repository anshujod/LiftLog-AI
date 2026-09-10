"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal structural types for the Web Speech API. It is non-standard and
 * absent from TypeScript's DOM lib, and ships as `SpeechRecognition` in
 * Chrome/Edge and `webkitSpeechRecognition` in Safari (14.1+). Only the
 * subset this hook uses is declared here.
 */
interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
  length: number;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}

interface SpeechErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return (ctor ?? null) as SpeechRecognitionCtor | null;
}

export type VoiceStatus = "idle" | "listening" | "done" | "error";

export type VoiceErrorKind =
  | "denied"
  | "no-speech"
  | "network"
  | "unsupported"
  | "unknown";

export interface UseVoiceInputOptions {
  /** Fired with the final transcript when listening ends with speech heard. */
  onDone?: (transcript: string) => void;
  /** Fired when recognition fails (denied, no-speech, network, unknown). */
  onError?: (kind: VoiceErrorKind) => void;
}

export interface UseVoiceInputResult {  /** False where the Web Speech API is unavailable (e.g. Firefox). */
  supported: boolean;
  status: VoiceStatus;
  /** Accumulated final transcript. Stable once status is "done". */
  transcript: string;
  /** In-progress (non-final) transcript while listening. */
  interim: string;
  error: VoiceErrorKind | null;
  /** Begin listening. No-op when unsupported or already listening. */
  start: () => void;
  /** Stop and keep what was heard (delivers final results, then "done"). */
  stop: () => void;
  /** Cancel listening and discard everything. */
  abort: () => void;
  /** Back to idle, clearing transcript and error. */
  reset: () => void;
}

/**
 * Push-to-talk speech capture for gym use. The transcript text is the only
 * thing that leaves this hook — no audio is recorded or stored. Recognition
 * itself streams to the browser vendor's servers and needs connectivity.
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputResult {
  const [supported] = useState<boolean>(() => getRecognitionCtor() !== null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<VoiceErrorKind | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef("");
  const statusRef = useRef<VoiceStatus>("idle");
  const abortingRef = useRef(false);
  // Latest callbacks for handlers attached inside start(). Mirrored in an
  // effect so async recognition events never see a stale closure.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const teardown = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // already stopped — nothing to do
      }
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || statusRef.current === "listening") return;

    teardown();
    abortingRef.current = false;
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    setError(null);

    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";

    rec.onresult = (event: SpeechResultEvent) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalRef.current = `${finalRef.current} ${text}`.trim();
          setTranscript(finalRef.current);
        } else {
          interimText += text;
        }
      }
      setInterim(interimText.trim());
    };

    rec.onerror = (event: SpeechErrorEvent) => {
      const kind: VoiceErrorKind | null =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "denied"
          : event.error === "no-speech"
            ? "no-speech"
            : event.error === "network"
              ? "network"
              : event.error === "aborted"
                ? null
                : "unknown";
      if (kind === null) return; // our own abort() — onend handles the reset
      setError(kind);
      setStatus("error");
      optionsRef.current.onError?.(kind);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      setInterim("");
      if (abortingRef.current) {
        abortingRef.current = false;
        return; // abort()/reset() already set the state
      }
      if (finalRef.current) {
        setStatus("done");
        optionsRef.current.onDone?.(finalRef.current);
      } else if (statusRef.current === "listening") {
        // Auto-ended with nothing heard and no specific error reported.
        setError("no-speech");
        setStatus("error");
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setStatus("listening");
    } catch {
      recognitionRef.current = null;
      setError("unknown");
      setStatus("error");
    }
  }, [teardown]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // already ended — onend delivers the final state
    }
  }, []);

  const abort = useCallback(() => {
    abortingRef.current = true;
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    setError(null);
    setStatus("idle");
    teardown();
  }, [teardown]);

  const reset = useCallback(() => {
    abortingRef.current = true;
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    setError(null);
    setStatus("idle");
    teardown();
  }, [teardown]);

  return { supported, status, transcript, interim, error, start, stop, abort, reset };
}
