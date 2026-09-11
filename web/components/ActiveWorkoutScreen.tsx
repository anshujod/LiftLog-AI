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

function SyncIndicator({ pendingCount, retrying }: { pendingCount: number; retrying: boolean }) {
  if (pendingCount === 0) return null;
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
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
  const [templates, setTemplates] = useState<WorkoutTemplateSummary[] | null>(null);
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const suggestionStartedRef = useRef(false);

  const [voiceLibrary, setVoiceLibrary] = useState<Exercise[] | null>(null);
  const [voiceLibraryLoading, setVoiceLibraryLoading] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState<VoiceLogCommand | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
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
    void activeWorkout.addExercise(exercise);
  }

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
      setFinishError(err instanceof ApiError ? err.message : "Couldn't finish the workout");
      setFinishing(false);
    }
  }

  if (activeWorkout.status === "resolving" || activeWorkout.status === "loading") {
    return (
      <div className="flex flex-col p-4" role="status" aria-label="Loading workout">
        <SkeletonStack rows={2} />
      </div>
    );
  }

  if (activeWorkout.status === "error") {
    return (
      <div className="p-4">
        <ErrorNote message={activeWorkout.error ?? "Couldn't load the workout"} />
      </div>
    );
  }

  if (activeWorkout.status === "none") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted">No workout in progress.</p>
        <button
          type="button"
          onClick={() => void activeWorkout.start()}
          className="h-14 w-full max-w-xs rounded-lg bg-accent-fill text-lg font-medium text-white"
        >
          Start workout
        </button>

        {templates !== null && templates.length > 0 && (
          <div className="flex w-full max-w-xs flex-col gap-2 pt-2 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Start from a template
            </p>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={startingTemplateId !== null}
                onClick={() => void handleStartFromTemplate(template.id)}
                className="flex h-12 items-center justify-between rounded-lg border border-border px-4 text-sm disabled:opacity-50"
              >
                <span className="truncate font-medium">
                  {template.name} · {template.exercise_count}
                </span>
                <span className="text-accent">
                  {startingTemplateId === template.id ? "Starting…" : "Start"}
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

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workout</h1>
        <SyncIndicator pendingCount={activeWorkout.pendingCount} retrying={activeWorkout.retrying} />
      </div>

      {restKey > 0 && (
        <div className="sticky top-2 z-30">
          <RestTimer key={restKey} onDismiss={() => setRestKey(0)} />
        </div>
      )}

      {activeWorkout.exercises.map((ex) => (
        <WorkoutExerciseCard
          key={ex.workoutExerciseId}
          displayExercise={ex}
          unit={unit}
          onLogSet={(values) => handleLogSet(ex.workoutExerciseId, values)}
          onUpdateSet={(clientId, values) => activeWorkout.updateSet(ex.workoutExerciseId, clientId, values)}
          onDeleteSet={(clientId) => activeWorkout.deleteSet(ex.workoutExerciseId, clientId)}
          onRemoveExercise={() => void activeWorkout.removeExercise(ex.workoutExerciseId)}
        />
      ))}

      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="h-12 rounded-lg border border-dashed border-border text-sm text-accent"
      >
        + Add exercise
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
          className="fixed bottom-40 left-1/2 z-40 max-w-[90vw] -translate-x-1/2 break-words rounded-2xl bg-surface px-4 py-2 text-center text-sm leading-snug shadow-lg"
        >
          {voice.interim ? `“${voice.interim}…”` : "Listening… say a set like “bench 60 kilos 8 reps”."}
        </p>
      )}

      {voiceNote && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm" role="status">
          <span>{voiceNote}</span>
          <button type="button" onClick={() => setVoiceNote(null)} className="flex min-h-11 shrink-0 items-center px-2 text-accent">
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
        className="h-14 rounded-lg bg-accent-fill text-lg font-medium text-white disabled:opacity-50"
      >
        {finishing
          ? "Finishing…"
          : activeWorkout.canFinish
            ? "Finish workout"
            : `Syncing… (${activeWorkout.pendingCount})`}
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
    </div>
  );
}
