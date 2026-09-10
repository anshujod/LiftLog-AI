import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceInput } from "./useVoiceInput";

interface FakeHandler {
  (event: never): void;
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = "";
  onresult: FakeHandler | null = null;
  onerror: FakeHandler | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }
}

function lastInstance(): FakeRecognition {
  const inst = FakeRecognition.instances[FakeRecognition.instances.length - 1];
  if (!inst) throw new Error("no recognition instance created");
  return inst;
}

function resultEvent(parts: { text: string; isFinal: boolean }[]) {
  return {
    resultIndex: 0,
    results: parts.map((p) => ({ 0: { transcript: p.text }, length: 1, isFinal: p.isFinal })),
  };
}

beforeEach(() => {
  FakeRecognition.instances = [];
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe("useVoiceInput", () => {
  it("reports unsupported when the browser has no speech recognition", () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    const { result } = renderHook(() => useVoiceInput());

    expect(result.current.supported).toBe(false);

    act(() => {
      result.current.start();
    });
    expect(result.current.status).toBe("idle");
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("delivers a final transcript and ends as done", () => {
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    expect(result.current.status).toBe("listening");

    const inst = lastInstance();
    act(() => {
      inst.onresult?.(resultEvent([{ text: "bench press sixty kilos", isFinal: true }]) as never);
    });
    expect(result.current.transcript).toBe("bench press sixty kilos");

    act(() => {
      inst.onend?.();
    });
    expect(result.current.status).toBe("done");
    expect(result.current.interim).toBe("");
  });

  it("surfaces interim results without touching the final transcript", () => {
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    const inst = lastInstance();
    act(() => {
      inst.onresult?.(resultEvent([{ text: "bench press", isFinal: false }]) as never);
    });

    expect(result.current.interim).toBe("bench press");
    expect(result.current.transcript).toBe("");
    expect(result.current.status).toBe("listening");
  });

  it("maps a blocked microphone to the denied error", () => {
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    act(() => {
      lastInstance().onerror?.({ error: "not-allowed" } as never);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("denied");
  });

  it("reports no-speech when recognition ends with nothing heard", () => {
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    act(() => {
      lastInstance().onend?.();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("no-speech");
  });

  it("stop keeps the transcript and finishes as done", () => {
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    const inst = lastInstance();
    act(() => {
      result.current.stop();
    });
    expect(inst.stop).toHaveBeenCalledTimes(1);

    act(() => {
      inst.onresult?.(resultEvent([{ text: "squat one hundred five", isFinal: true }]) as never);
      inst.onend?.();
    });
    expect(result.current.status).toBe("done");
    expect(result.current.transcript).toBe("squat one hundred five");
  });

  it("abort discards everything and returns to idle", () => {
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    const inst = lastInstance();
    act(() => {
      inst.onresult?.(resultEvent([{ text: "bench", isFinal: true }]) as never);
    });
    act(() => {
      result.current.abort();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.transcript).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("reset clears a finished session", () => {
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    const inst = lastInstance();
    act(() => {
      inst.onresult?.(resultEvent([{ text: "deadlift", isFinal: true }]) as never);
      inst.onend?.();
    });
    expect(result.current.status).toBe("done");

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.transcript).toBe("");
  });

  it("fires onDone with the final transcript", () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onDone }));

    act(() => {
      result.current.start();
    });
    const inst = lastInstance();
    act(() => {
      inst.onresult?.(resultEvent([{ text: "bench sixty", isFinal: true }]) as never);
      inst.onend?.();
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("bench sixty");
  });

  it("fires onError with the mapped kind", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onError }));

    act(() => {
      result.current.start();
    });
    act(() => {
      lastInstance().onerror?.({ error: "network" } as never);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("network");
  });
});
