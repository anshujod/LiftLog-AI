import { addSet, deleteSet, updateSet } from "@/lib/api/workouts";
import type { SetInput, SetPatch, WorkoutSet } from "@/lib/api/workouts";

export type QueueOp =
  | { kind: "add_set"; opId: string; workoutExerciseId: string; clientSetId: string; data: SetInput }
  | { kind: "update_set"; opId: string; clientSetId: string; data: SetPatch }
  | { kind: "delete_set"; opId: string; clientSetId: string };

export interface SyncQueueCallbacks {
  onSetAdded: (clientSetId: string, set: WorkoutSet) => void;
  onSetSynced: (clientSetId: string) => void;
  onQueueChange: (pendingCount: number, retrying: boolean) => void;
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

function storageKey(workoutId: string): string {
  return `liftlog:workout:${workoutId}:queue`;
}

export function loadQueue(workoutId: string): QueueOp[] {
  try {
    const raw = localStorage.getItem(storageKey(workoutId));
    return raw ? (JSON.parse(raw) as QueueOp[]) : [];
  } catch {
    return [];
  }
}

function persistQueue(workoutId: string, queue: QueueOp[]): void {
  try {
    localStorage.setItem(storageKey(workoutId), JSON.stringify(queue));
  } catch {
    // best-effort — a full or unavailable localStorage shouldn't block logging
  }
}

/**
 * Ops for one workout are processed strictly in the order they're enqueued (one
 * in flight at a time), which is what makes id resolution safe without a
 * separate persisted id map: an update/delete op for a given clientSetId can
 * only run after that set's add_set op has already resolved and rewritten it
 * in place, so `op.clientSetId` is always the real server id by the time an
 * update/delete op actually executes.
 */
export class SyncQueue {
  private queue: QueueOp[];
  private processing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(
    private readonly workoutId: string,
    private readonly callbacks: SyncQueueCallbacks
  ) {
    this.queue = loadQueue(workoutId);
  }

  /** Resume processing any ops that survived a page refresh. Call once after mount. */
  resume(): void {
    this.kick();
  }

  enqueue(op: QueueOp): void {
    if (op.kind === "delete_set") {
      const addIndex = this.queue.findIndex(
        (queued, index) =>
          queued.kind === "add_set" &&
          queued.clientSetId === op.clientSetId &&
          !(index === 0 && this.processing)
      );
      if (addIndex !== -1) {
        // The set never made it to the server — drop both ops instead of a
        // wasted create-then-delete round trip.
        this.queue.splice(addIndex, 1);
        this.persist();
        return;
      }
    }

    if (op.kind === "update_set") {
      const lastIndex = this.queue.length - 1;
      const last = this.queue[lastIndex];
      if (
        last?.kind === "update_set" &&
        last.clientSetId === op.clientSetId &&
        !(lastIndex === 0 && this.processing)
      ) {
        this.queue[lastIndex] = { ...last, data: { ...last.data, ...op.data } };
        this.persist();
        this.kick();
        return;
      }
    }

    this.queue.push(op);
    this.persist();
    this.kick();
  }

  destroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private persist(): void {
    persistQueue(this.workoutId, this.queue);
    this.callbacks.onQueueChange(this.queue.length, this.attempt > 0);
  }

  private kick(): void {
    if (this.processing || this.retryTimer) return;
    void this.processNext();
  }

  private async processNext(): Promise<void> {
    const op = this.queue[0];
    if (!op) return;
    this.processing = true;

    try {
      await this.run(op);
      this.attempt = 0;
      this.queue.shift();
      this.processing = false;
      this.persist();
      void this.processNext();
    } catch {
      this.processing = false;
      this.attempt += 1;
      this.callbacks.onQueueChange(this.queue.length, true);
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (this.attempt - 1), MAX_BACKOFF_MS);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.processNext();
      }, delay);
    }
  }

  private async run(op: QueueOp): Promise<void> {
    switch (op.kind) {
      case "add_set": {
        const set = await addSet(op.workoutExerciseId, op.data);
        this.resolveClientId(op.clientSetId, set.id);
        this.callbacks.onSetAdded(op.clientSetId, set);
        return;
      }
      case "update_set": {
        await updateSet(op.clientSetId, op.data);
        this.callbacks.onSetSynced(op.clientSetId);
        return;
      }
      case "delete_set": {
        await deleteSet(op.clientSetId);
        this.callbacks.onSetSynced(op.clientSetId);
        return;
      }
    }
  }

  private resolveClientId(localId: string, realId: string): void {
    if (localId === realId) return;
    this.queue = this.queue.map((queued) =>
      queued.clientSetId === localId ? { ...queued, clientSetId: realId } : queued
    );
  }
}
