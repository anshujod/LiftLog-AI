"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveWorkout } from "@/hooks/useActiveWorkout";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useWakeLock } from "@/hooks/useWakeLock";
import { ExercisePicker } from "@/components/ExercisePicker";
import { FloatingVoiceButton } from "@/components/FloatingVoiceButton";
import { VoiceConfirmSheet, type VoiceConfirmValues } from "@/components/VoiceConfirmSheet";
import { WorkoutExerciseCard } from "@/components/WorkoutExerciseCard";
import { BodyweightSheet } from "@/components/BodyweightSheet";
import { RestTimer } from "@/components/RestTimer";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { SkeletonStack } from "@/components/ui/Skeleton";
import { getUnitPreference, type Unit } from "@/lib/units";
import { parseVoiceCommand, type VoiceLogCommand } from "@/lib/voice/parse";
import type { SetRowValues } from "@/components/SetRow";
import { getExercise, listExercises, type Exercise } from "@/lib/api/exercises";
import {
  listTemplates,
  startWorkoutFromTemplate,
  type WorkoutTemplateSummary,
} from "@/lib/api/templates";
import { ApiError } from "@/lib/api/errors";
import { notifyBodyweightSaved } from "@/lib/api/bodyweight-events";

function SyncIndicator({ pendingCount, retrying }: { pendingCount: number; retrying: boolean }) {
  if (pendingCount === 0)
    return (
      <span role="status" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-acid">
        <span className="h-1.5 w-1.5 bg-acid" aria-hidden="true" />
        Saved
      </span>
    );
  return (
    <span role="status" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
      <span className="h-1.5 w-1.5 animate-pulse bg-muted" aria-hidden="true" />
      {retrying ? "Waiting for connection…" : `Syncing… (${pendingCount})`}
    </span>
  );
}

const VOICE_ERROR_NOTES: Record<string, string> = {
  denied: "Microphone is blocked — allow access in the browser settings to log by voice.",
  "no-speech": "Didn't hear anything — try again, closer to the mic.",
  network: "Voice needs a connection right now — sets you already logged are safe.",
  unknown: "Voice input failed — type the set instead.",
};

export function ActiveWorkoutScreen() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resume");
  const suggestParam = searchParams.get("suggest");
  const router = useRouter();
  const activeWorkout = useActiveWorkout(resumeId);
  const [unit, setUnit] = useState<Unit>("kg");
  const [showPicker, setShowPicker] = useState(false);
  const [restKey, setRestKey] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [showBodyweightSheet, setShowBodyweightSheet] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplateSummary[] | null>(null);
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const suggestionStartedRef = useRef(false);

  const [voiceLibrary, setVoiceLibrary] = useState<Exercise[] | null>(null);
  const [voiceLibraryLoading, setVoiceLibraryLoading] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState<VoiceLogCommand | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  // Fresh values for the async voice callbacks without re-subscribing.
  const voiceLibraryRef = useRef<Exercise[] | null>(null);
  const unitRef = useRef(unit);
  const exercisesRef = useRef(activeWorkout.exercises);
  useEffect(() => {
    voiceLibraryRef.current = voiceLibrary;
    unitRef.current = unit;
    exercisesRef.current = activeWorkout.exercises;
  });

  const voice = useVoiceInput({
    onDone: (transcript) => {
      const command = parseVoiceCommand(transcript, voiceLibraryRef.current ?? [], unitRef.current);
      if (command.kind === "repeat") {
        const withSets = [...exercisesRef.current].reverse().find((ex) => ex.sets.length > 0);
        if (!withSets) {
          setVoiceNote("Nothing logged yet — say a full set first, like “bench 60 kilos 8 reps”.");
        } else {
          const last = withSets.sets[withSets.sets.length - 1];
          setVoiceCommand({
            kind: "log",
            transcript,
            exerciseId: withSets.exercise.id,
            exerciseName: withSets.exercise.name,
            exercisePhrase: "",
            candidates: [],
            loadG: last.load_g,
            reps: last.reps,
            sets: 1,
            isWarmup: false,
            confidence: "high",
          });
        }
      } else if (command.kind === "log") {
        setVoiceCommand(command);
      } else {
        setVoiceNote("Didn't catch that — try “bench 60 kilos 8 reps”.");
      }
    },
    onError: (kind) => setVoiceNote(VOICE_ERROR_NOTES[kind] ?? VOICE_ERROR_NOTES.unknown),
  });

  useWakeLock(activeWorkout.status === "ready");

  useEffect(() => {
    getUnitPreference()
      .then(setUnit)
      .catch(() => {});
  }, []);

  // A "Start this workout" tap from the dashboard's suggestion card lands here
  // with ?suggest=<exerciseId,...> — turn that into an actual one-tap start.
  useEffect(() => {
    if (activeWorkout.status !== "none" || !suggestParam || suggestionStartedRef.current) return;
    suggestionStartedRef.current = true;
    const ids = suggestParam.split(",").filter(Boolean);
    void (async () => {
      const exercises = (await Promise.allSettled(ids.map((id) => getExercise(id))))
        .filter((r): r is PromiseFulfilledResult<Exercise> => r.status === "fulfilled")
        .map((r) => r.value);
      await activeWorkout.startWithExercises(exercises);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout.status, suggestParam]);

  useEffect(() => {
    if (activeWorkout.status !== "none") return;
    let cancelled = false;
    listTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkout.status]);

  async function handleStartFromTemplate(templateId: string) {
    setStartingTemplateId(templateId);
    setTemplateError(null);
    try {
      const workout = await startWorkoutFromTemplate(templateId);
      router.push(`/workout?resume=${workout.id}`);
    } catch (err) {
      setTemplateError(err instanceof ApiError ? err.message : "Couldn't start from the template");
      setStartingTemplateId(null);
    }
  }

  function handleLogSet(workoutExerciseId: string, values: SetRowValues) {
    activeWorkout.addSet(workoutExerciseId, values);
    // Warmups don't earn a rest timer — only working sets restart it.
    if (!values.is_warmup) setRestKey((k) => k + 1);
  }

  function handleAddExercise(exercise: Exercise) {
    setShowPicker(false);
    void activeWorkout.addExercise(exercise).then(() => {
      setFocusIndex(activeWorkout.exercises.length);
    });
  }

  // Clamped during render (no effect): stays in range as exercises are added/removed.
  const safeFocusIndex =
    activeWorkout.exercises.length === 0
      ? 0
      : Math.min(focusIndex, activeWorkout.exercises.length - 1);

  async function handleMicPress() {
    if (voice.status === "listening") {
      voice.stop();
      return;
    }
    setVoiceNote(null);
    let library = voiceLibrary;
    if (!library && !voiceLibraryLoading) {
      setVoiceLibraryLoading(true);
      try {
        library = await listExercises();
        setVoiceLibrary(library);
      } catch {
        setVoiceNote("Couldn't load exercises for voice matching — check your connection.");
        setVoiceLibraryLoading(false);
        return;
      }
      setVoiceLibraryLoading(false);
    }
    if (library) voice.start();
  }

  async function handleVoiceConfirm(values: VoiceConfirmValues) {
    const existing = activeWorkout.exercises.find((ex) => ex.exercise.id === values.exerciseId);
    let workoutExerciseId = existing?.workoutExerciseId;
    if (!workoutExerciseId) {
      const exercise = voiceLibrary?.find((e) => e.id === values.exerciseId);
      if (!exercise) {
        setVoiceNote("Couldn't find that exercise anymore — pick it by hand.");
        setVoiceCommand(null);
        return;
      }
      workoutExerciseId = (await activeWorkout.addExercise(exercise)).id;
    }
    for (let i = 0; i < values.sets; i++) {
      activeWorkout.addSet(workoutExerciseId, {
        load_g: values.loadG,
        reps: values.reps,
        is_warmup: values.isWarmup,
      });
    }
    if (!values.isWarmup) setRestKey((k) => k + 1);
    setVoiceCommand(null);
  }

  async function handleFinish() {
    if (!activeWorkout.canFinish || !activeWorkout.workout) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const summary = await activeWorkout.finish();
      try {
        sessionStorage.setItem(`liftlog:finish:${activeWorkout.workout.id}`, JSON.stringify(summary));
      } catch {
        // non-critical — the detail page still renders without the celebratory summary
      }
      router.push(`/workout/${activeWorkout.workout.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "bodyweight_required") {
        // Finish needs a stored body weight for bodyweight-type lifts.
        // Ask once, save, then retry automatically.
        setShowBodyweightSheet(true);
        setFinishing(false);
        return;
      }
      setFinishError(err instanceof ApiError ? err.message : "Couldn't finish the workout");
      setFinishing(false);
    }
  }

  if (activeWorkout.status === "resolving" || activeWorkout.status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col p-4" role="status" aria-label="Loading workout">
        <SkeletonStack rows={2} />
      </div>
    );
  }

  if (activeWorkout.status === "error") {
    return (
      <div className="mx-auto w-full max-w-xl p-4">
        <ErrorNote message={activeWorkout.error ?? "Couldn't load the workout"} />
      </div>
    );
  }

  if (activeWorkout.status === "none") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pb-10 pt-6">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">New workout</p>
          <h1 className="font-display text-[clamp(36px,9vw,56px)] leading-[0.95]">
            Start training
            <span className="text-acid">.</span>
          </h1>
          <p className="max-w-md text-sm text-muted">
            No session in progress. Start empty or from a template — exercises prefill from
            last time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void activeWorkout.start()}
          className="slab-press flex min-h-[76px] items-center justify-between bg-acid px-5 text-background"
        >
          <span className="font-display text-2xl tracking-wide">Start workout</span>
          <span aria-hidden="true" className="font-display text-2xl">→</span>
        </button>

        {templates !== null && templates.length > 0 && (
          <div className="flex w-full flex-col gap-1 pt-2 text-left">
            <p className="eyebrow border-b hairline pb-2">
              Start from a template
            </p>
            {templates.map((template, i) => (
              <button
                key={template.id}
                type="button"
                disabled={startingTemplateId !== null}
                onClick={() => void handleStartFromTemplate(template.id)}
                className="flex min-h-[56px] items-baseline justify-between gap-3 border-b hairline py-3 text-left disabled:opacity-50"
              >
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="tabular-nums text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate text-lg font-semibold tracking-tight">
                    {template.name} <span className="text-sm font-normal text-muted">· {template.exercise_count}</span>
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-acid">
                  {startingTemplateId === template.id ? "Starting…" : "Start →"}
                </span>
              </button>
            ))}
            {templateError && (
              <ErrorNote message={templateError} />
            )}
          </div>
        )}
      </div>
    );
  }

  const totalSets = activeWorkout.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const focused = activeWorkout.exercises[safeFocusIndex] ?? null;
  const exerciseCount = activeWorkout.exercises.length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 bg-sunken/40 px-4 pb-10 pt-4 md:max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted" aria-live="polite">
          {exerciseCount === 0
            ? "No exercises yet"
            : `Exercise ${Math.min(safeFocusIndex + 1, exerciseCount)} of ${exerciseCount} · ${totalSets} sets`}
        </p>
        <SyncIndicator pendingCount={activeWorkout.pendingCount} retrying={activeWorkout.retrying} />
      </div>

      {exerciseCount > 1 && (
        <div className="flex items-center justify-between gap-2" role="tablist" aria-label="Exercises in this workout">
          <button
            type="button"
            onClick={() => setFocusIndex(Math.max(0, safeFocusIndex - 1))}
            disabled={safeFocusIndex <= 0}
            aria-label="Previous exercise"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center border hairline text-lg disabled:opacity-30"
          >
            ←
          </button>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {activeWorkout.exercises.map((ex, i) => (
              <span
                key={ex.workoutExerciseId}
                className={`h-1.5 w-6 ${i === safeFocusIndex ? "bg-acid" : "bg-faint/40"}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFocusIndex(Math.min(exerciseCount - 1, safeFocusIndex + 1))}
            disabled={safeFocusIndex >= exerciseCount - 1}
            aria-label="Next exercise"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center border hairline text-lg disabled:opacity-30"
          >
            →
          </button>
        </div>
      )}

      {restKey > 0 && (
        <div className="sticky top-2 z-30" role="region" aria-label="Rest timer">
          <RestTimer key={restKey} onDismiss={() => setRestKey(0)} />
        </div>
      )}

      {focused && (
        <WorkoutExerciseCard
          key={focused.workoutExerciseId}
          displayExercise={focused}
          index={safeFocusIndex}
          unit={unit}
          onLogSet={(values) => handleLogSet(focused.workoutExerciseId, values)}
          onUpdateSet={(clientId, values) => activeWorkout.updateSet(focused.workoutExerciseId, clientId, values)}
          onDeleteSet={(clientId) => activeWorkout.deleteSet(focused.workoutExerciseId, clientId)}
          onRemoveExercise={() => void activeWorkout.removeExercise(focused.workoutExerciseId)}
        />
      )}

      {exerciseCount > 1 && (
        <div className="flex flex-col gap-1">
          <p className="eyebrow">Up next</p>
          <ul className="flex flex-col">
            {activeWorkout.exercises.map((ex, i) => {
              if (i === safeFocusIndex) return null;
              const working = ex.sets.filter((s) => !s.is_warmup).length;
              return (
                <li key={ex.workoutExerciseId} className="border-b hairline">
                  <button
                    type="button"
                    onClick={() => setFocusIndex(i)}
                    className="flex min-h-[52px] w-full items-baseline justify-between gap-2 py-2 text-left"
                  >
                    <span className="truncate text-[15px]">{ex.exercise.name}</span>
                    <span className="shrink-0 tabular-nums text-xs text-muted">
                      {working} sets
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="flex min-h-[60px] items-center justify-between border border-dashed border-faint px-4 text-left"
      >
        <span className="text-sm font-bold uppercase tracking-[0.14em] text-foreground">+ Add exercise</span>
        <span aria-hidden="true" className="text-muted">→</span>
      </button>

      {voice.supported && (
        <FloatingVoiceButton
          listening={voice.status === "listening"}
          disabled={voiceLibraryLoading}
          onPress={() => void handleMicPress()}
        />
      )}

      {voice.status === "listening" && (
        <p
          aria-live="polite"
          className="fixed bottom-40 left-1/2 z-40 max-w-[90vw] -translate-x-1/2 break-words rounded-[2px] border hairline bg-surface-raised px-4 py-2 text-center text-sm leading-snug"
        >
          {voice.interim ? `“${voice.interim}…”` : "Listening… say a set like “bench 60 kilos 8 reps”."}
        </p>
      )}

      {voiceNote && (
        <div className="flex items-center justify-between gap-2 rounded-[2px] border-l-2 border-acid bg-surface p-3 text-sm" role="status">
          <span>{voiceNote}</span>
          <button type="button" onClick={() => setVoiceNote(null)} className="flex min-h-11 shrink-0 items-center px-2 text-xs font-bold uppercase tracking-[0.12em] text-foreground underline underline-offset-4">
            Dismiss
          </button>
        </div>
      )}

      {finishError && (
        <ErrorNote message={finishError} />
      )}

      <button
        type="button"
        onClick={() => void handleFinish()}
        disabled={!activeWorkout.canFinish || finishing || activeWorkout.exercises.length === 0}
        className="slab-press sticky bottom-3 flex min-h-[72px] items-center justify-between bg-acid px-5 text-background disabled:opacity-50"
      >
        <span className="font-display text-2xl tracking-wide">
          {finishing
            ? "Finishing…"
            : activeWorkout.canFinish
              ? "Finish workout"
              : `Syncing… (${activeWorkout.pendingCount})`}
        </span>
        <span aria-hidden="true" className="font-display text-2xl">■</span>
      </button>

      {showPicker && (
        <ExercisePicker variant="sheet" onSelect={handleAddExercise} onClose={() => setShowPicker(false)} />
      )}

      {voiceCommand && voiceLibrary && (
        <VoiceConfirmSheet
          command={voiceCommand}
          library={voiceLibrary}
          unit={unit}
          onConfirm={handleVoiceConfirm}
          onClose={() => setVoiceCommand(null)}
        />
      )}

      {showBodyweightSheet && (
        <BodyweightSheet
          onClose={() => setShowBodyweightSheet(false)}
          onSaved={() => {
            setShowBodyweightSheet(false);
            notifyBodyweightSaved();
            void handleFinish();
          }}
        />
      )}
    </div>
  );
}
