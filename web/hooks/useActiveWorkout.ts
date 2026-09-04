"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addWorkoutExercise,
  createWorkout,
  deleteWorkoutExercise,
  finishWorkout,
  getWorkout,
  listWorkouts,
  type FinishSummary,
  type SetInput,
  type SetPatch,
  type Workout,
  type WorkoutExercise,
} from "@/lib/api/workouts";
import { getLastSession, type Exercise } from "@/lib/api/exercises";
import { SyncQueue, loadQueue, type QueueOp } from "@/lib/workout/syncQueue";
import { ApiError } from "@/lib/api/errors";

export interface DisplaySet {
  clientId: string;
  load_g: number;
  reps: number;
  is_warmup: boolean;
  syncStatus: "synced" | "pending";
}

export interface DisplayExercise {
  workoutExerciseId: string;
  exercise: Exercise;
  sets: DisplaySet[];
  /** Working sets (warmups excluded) from the last completed session, for prefill. */
  lastSessionSets: { load_g: number; reps: number }[];
}

type Status = "resolving" | "none" | "loading" | "ready" | "error";

function localClientId(): string {
  return `local:${crypto.randomUUID()}`;
}

function toDisplayExercise(we: WorkoutExercise): DisplayExercise {
  return {
    workoutExerciseId: we.id,
    exercise: we.exercise,
    sets: we.sets.map((s) => ({
      clientId: s.id,
      load_g: s.load.grams,
      reps: s.reps,
      is_warmup: s.is_warmup,
      syncStatus: "synced",
    })),
    lastSessionSets: [],
  };
}

function applyQueueOverlay(exercises: DisplayExercise[], queue: QueueOp[]): DisplayExercise[] {
  const byWorkoutExercise = new Map(exercises.map((e) => [e.workoutExerciseId, e]));

  for (const op of queue) {
    if (op.kind === "add_set") {
      const target = byWorkoutExercise.get(op.workoutExerciseId);
      target?.sets.push({
        clientId: op.clientSetId,
        load_g: op.data.load_g,
        reps: op.data.reps,
        is_warmup: op.data.is_warmup ?? false,
        syncStatus: "pending",
      });
    } else if (op.kind === "update_set") {
      for (const ex of exercises) {
        const set = ex.sets.find((s) => s.clientId === op.clientSetId);
        if (!set) continue;
        if (op.data.load_g != null) set.load_g = op.data.load_g;
        if (op.data.reps != null) set.reps = op.data.reps;
        if (op.data.is_warmup != null) set.is_warmup = op.data.is_warmup;
        set.syncStatus = "pending";
        break;
      }
    } else if (op.kind === "delete_set") {
      for (const ex of exercises) {
        const index = ex.sets.findIndex((s) => s.clientId === op.clientSetId);
        if (index !== -1) {
          ex.sets.splice(index, 1);
          break;
        }
      }
    }
  }

  return exercises;
}

export interface UseActiveWorkoutResult {
  status: Status;
  error: string | null;
  workout: Workout | null;
  exercises: DisplayExercise[];
  pendingCount: number;
  retrying: boolean;
  canFinish: boolean;
  start: () => Promise<void>;
  addExercise: (exercise: Exercise) => Promise<void>;
  removeExercise: (workoutExerciseId: string) => Promise<void>;
  addSet: (workoutExerciseId: string, data: SetInput) => void;
  updateSet: (workoutExerciseId: string, clientId: string, data: SetPatch) => void;
  deleteSet: (workoutExerciseId: string, clientId: string) => void;
  finish: () => Promise<FinishSummary>;
}

/**
 * Owns the active-workout screen's data: resolving/creating the in-progress workout,
 * hydrating it from the server plus any not-yet-synced local queue (so a refresh mid
 * set never drops data), and exposing optimistic set mutations backed by a
 * background retry queue.
 */
export function useActiveWorkout(resumeId: string | null | undefined): UseActiveWorkoutResult {
  const [status, setStatus] = useState<Status>("resolving");
  const [error, setError] = useState<string | null>(null);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exercises, setExercises] = useState<DisplayExercise[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const queueRef = useRef<SyncQueue | null>(null);

  const attachQueue = useCallback((workoutId: string) => {
    queueRef.current?.destroy();
    const queue = new SyncQueue(workoutId, {
      onSetAdded: (clientSetId, set) => {
        setExercises((prev) =>
          prev.map((ex) => ({
            ...ex,
            sets: ex.sets.map((s) =>
              s.clientId === clientSetId
                ? {
                    clientId: set.id,
                    load_g: set.load.grams,
                    reps: set.reps,
                    is_warmup: set.is_warmup,
                    syncStatus: "synced",
                  }
                : s
            ),
          }))
        );
      },
      onSetSynced: (clientSetId) => {
        setExercises((prev) =>
          prev.map((ex) => ({
            ...ex,
            sets: ex.sets.map((s) => (s.clientId === clientSetId ? { ...s, syncStatus: "synced" } : s)),
          }))
        );
      },
      onQueueChange: (count, isRetrying) => {
        setPendingCount(count);
        setRetrying(isRetrying);
      },
    });
    queueRef.current = queue;
    return queue;
  }, []);

  const hydrate = useCallback(
    async (workoutId: string) => {
      setStatus("loading");
      setError(null);
      try {
        const data = await getWorkout(workoutId);
        const queue = attachQueue(workoutId);
        const persisted = loadQueue(workoutId);
        const displayExercises = applyQueueOverlay(data.workout_exercises.map(toDisplayExercise), persisted);

        const withLastSessions = await Promise.all(
          displayExercises.map(async (ex) => {
            try {
              const lastSession = await getLastSession(ex.exercise.id);
              const lastSessionSets =
                lastSession.session?.sets
                  .filter((s) => !s.is_warmup)
                  .map((s) => ({ load_g: s.load.grams, reps: s.reps })) ?? [];
              return { ...ex, lastSessionSets };
            } catch {
              return ex;
            }
          })
        );

        setWorkout(data);
        setExercises(withLastSessions);
        setPendingCount(persisted.length);
        queue.resume();
        setStatus("ready");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't load this workout");
        setStatus("error");
      }
    },
    [attachQueue]
  );

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (resumeId) {
        if (!cancelled) void hydrate(resumeId);
        return;
      }
      setStatus("resolving");
      try {
        const page = await listWorkouts({ limit: 5 });
        const active = page.workouts.find((w) => w.ended_at === null);
        if (cancelled) return;
        if (active) {
          void hydrate(active.id);
        } else {
          setStatus("none");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Couldn't check for an active workout");
          setStatus("error");
        }
      }
    }

    void resolve();
    return () => {
      cancelled = true;
      queueRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  const start = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const created = await createWorkout();
      attachQueue(created.id);
      setWorkout(created);
      setExercises([]);
      setPendingCount(0);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start a workout");
      setStatus("error");
    }
  }, [attachQueue]);

  const addExercise = useCallback(
    async (exercise: Exercise) => {
      if (!workout) return;
      const we = await addWorkoutExercise(workout.id, exercise.id);
      let lastSessionSets: { load_g: number; reps: number }[] = [];
      try {
        const lastSession = await getLastSession(exercise.id);
        lastSessionSets =
          lastSession.session?.sets
            .filter((s) => !s.is_warmup)
            .map((s) => ({ load_g: s.load.grams, reps: s.reps })) ?? [];
      } catch {
        // last-session prefill is a nicety — an empty draft row still works
      }
      setExercises((prev) => [...prev, { ...toDisplayExercise(we), lastSessionSets }]);
    },
    [workout]
  );

  const removeExercise = useCallback(async (workoutExerciseId: string) => {
    setExercises((prev) => prev.filter((ex) => ex.workoutExerciseId !== workoutExerciseId));
    await deleteWorkoutExercise(workoutExerciseId);
  }, []);

  const addSet = useCallback((workoutExerciseId: string, data: SetInput) => {
    const clientId = localClientId();
    setExercises((prev) =>
      prev.map((ex) =>
        ex.workoutExerciseId === workoutExerciseId
          ? {
              ...ex,
              sets: [
                ...ex.sets,
                {
                  clientId,
                  load_g: data.load_g,
                  reps: data.reps,
                  is_warmup: data.is_warmup ?? false,
                  syncStatus: "pending",
                },
              ],
            }
          : ex
      )
    );
    queueRef.current?.enqueue({
      kind: "add_set",
      opId: crypto.randomUUID(),
      workoutExerciseId,
      clientSetId: clientId,
      data,
    });
  }, []);

  const updateSet = useCallback((workoutExerciseId: string, clientId: string, data: SetPatch) => {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.workoutExerciseId === workoutExerciseId
          ? {
              ...ex,
              sets: ex.sets.map((s) =>
                s.clientId === clientId
                  ? {
                      ...s,
                      load_g: data.load_g ?? s.load_g,
                      reps: data.reps ?? s.reps,
                      is_warmup: data.is_warmup ?? s.is_warmup,
                      syncStatus: "pending",
                    }
                  : s
              ),
            }
          : ex
      )
    );
    queueRef.current?.enqueue({ kind: "update_set", opId: crypto.randomUUID(), clientSetId: clientId, data });
  }, []);

  const deleteSet = useCallback((workoutExerciseId: string, clientId: string) => {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.workoutExerciseId === workoutExerciseId
          ? { ...ex, sets: ex.sets.filter((s) => s.clientId !== clientId) }
          : ex
      )
    );
    queueRef.current?.enqueue({ kind: "delete_set", opId: crypto.randomUUID(), clientSetId: clientId });
  }, []);

  const finish = useCallback(async () => {
    if (!workout) throw new Error("No active workout");
    return finishWorkout(workout.id);
  }, [workout]);

  return {
    status,
    error,
    workout,
    exercises,
    pendingCount,
    retrying,
    canFinish: pendingCount === 0,
    start,
    addExercise,
    removeExercise,
    addSet,
    updateSet,
    deleteSet,
    finish,
  };
}
