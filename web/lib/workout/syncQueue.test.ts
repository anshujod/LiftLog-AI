import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { SyncQueue, type QueueOp, type SyncQueueCallbacks } from "./syncQueue";
import { addSet, deleteSet, updateSet } from "@/lib/api/workouts";
import type { WorkoutSet } from "@/lib/api/workouts";

vi.mock("@/lib/api/workouts", () => ({
  addSet: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
}));

const addSetMock = vi.mocked(addSet);
const updateSetMock = vi.mocked(updateSet);
const deleteSetMock = vi.mocked(deleteSet);

let idCounter = 0;
function opId(): string {
  idCounter += 1;
  return `op-${idCounter}`;
}

function serverSet(id: string): WorkoutSet {
  return {
    id,
    workout_exercise_id: "we-1",
    set_number: 1,
    load: { grams: 100000, display: "100 kg" },
    reps: 5,
    is_warmup: false,
    rpe: null,
    notes: null,
  } as unknown as WorkoutSet;
}

function callbacks(): SyncQueueCallbacks & {
  added: Array<{ clientSetId: string; set: WorkoutSet }>;
  synced: string[];
  changes: Array<{ pending: number; retrying: boolean }>;
} {
  const added: Array<{ clientSetId: string; set: WorkoutSet }> = [];
  const synced: string[] = [];
  const changes: Array<{ pending: number; retrying: boolean }> = [];
  return {
    added,
    synced,
    changes,
    onSetAdded: (clientSetId, set) => added.push({ clientSetId, set }),
    onSetSynced: (clientSetId) => synced.push(clientSetId),
    onQueueChange: (pendingCount, retrying) =>
      changes.push({ pending: pendingCount, retrying }),
  };
}

function addOp(clientSetId: string): QueueOp {
  return {
    kind: "add_set",
    opId: opId(),
    workoutExerciseId: "we-1",
    clientSetId,
    data: { load_g: 100000, reps: 5, is_warmup: false },
  };
}

describe("SyncQueue under flaky network", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a failing op and syncs exactly once — no loss, no duplicate", async () => {
    const cb = callbacks();
    const queue = new SyncQueue("w-flaky", cb);
    addSetMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(serverSet("server-1"));

    queue.enqueue(addOp("client-1"));
    expect(cb.added).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000); // first retry (1s backoff)
    await vi.advanceTimersByTimeAsync(2000); // second retry (2s backoff)
    await vi.advanceTimersByTimeAsync(10); // let the success settle

    expect(cb.added).toHaveLength(1);
    expect(cb.added[0]).toMatchObject({ clientSetId: "client-1" });
    expect(cb.added[0].set.id).toBe("server-1");
    // Two failed attempts + exactly one successful POST.
    expect(addSetMock).toHaveBeenCalledTimes(3);
    expect(cb.changes.at(-1)).toEqual({ pending: 0, retrying: false });
    queue.destroy();
  });

  it("keeps the op queued while the network is down, then drains — never stuck", async () => {
    const cb = callbacks();
    const queue = new SyncQueue("w-down", cb);
    addSetMock.mockRejectedValue(new Error("offline"));

    queue.enqueue(addOp("client-9"));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(cb.added).toHaveLength(0);
    expect(cb.changes.at(-1)).toMatchObject({ retrying: true });

    // Network returns: the still-queued op goes through on the next retry.
    addSetMock.mockReset();
    addSetMock.mockResolvedValue(serverSet("server-9"));
    await vi.advanceTimersByTimeAsync(30000);
    await vi.advanceTimersByTimeAsync(10);

    expect(cb.added).toHaveLength(1);
    expect(cb.changes.at(-1)).toEqual({ pending: 0, retrying: false });
    queue.destroy();
  });

  it("coalesces add-then-delete while a retry is pending — no follow-up calls", async () => {
    const cb = callbacks();
    const queue = new SyncQueue("w-coalesce", cb);
    addSetMock.mockRejectedValue(new Error("offline"));

    queue.enqueue(addOp("client-2"));
    await vi.advanceTimersByTimeAsync(0); // let the first attempt fail; retry now pending
    expect(addSetMock).toHaveBeenCalledTimes(1);
    queue.enqueue({ kind: "delete_set", opId: opId(), clientSetId: "client-2" });
    await vi.advanceTimersByTimeAsync(60000);

    // The set never reached the server: no retry storm, no orphan delete.
    expect(addSetMock).toHaveBeenCalledTimes(1);
    expect(deleteSetMock).not.toHaveBeenCalled();
    expect(cb.changes.at(-1)).toEqual({ pending: 0, retrying: false });
    queue.destroy();
  });

  it("resumes ops that survived a page refresh", async () => {
    const cb1 = callbacks();
    const queue1 = new SyncQueue("w-resume", cb1);
    addSetMock.mockRejectedValue(new Error("offline"));
    queue1.enqueue(addOp("client-3"));
    await vi.advanceTimersByTimeAsync(500);
    expect(cb1.added).toHaveLength(0);
    queue1.destroy();

    // "Reload": a new instance picks up the persisted queue.
    addSetMock.mockReset();
    addSetMock.mockResolvedValue(serverSet("server-3"));
    const cb2 = callbacks();
    const queue2 = new SyncQueue("w-resume", cb2);
    queue2.resume();
    await vi.advanceTimersByTimeAsync(30000);
    await vi.advanceTimersByTimeAsync(10);

    expect(cb2.added).toHaveLength(1);
    expect(cb2.added[0].set.id).toBe("server-3");
    queue2.destroy();
  });

  it("queues a second update while one is in flight instead of duplicating it", async () => {
    const cb = callbacks();
    const queue = new SyncQueue("w-merge", cb);
    updateSetMock.mockImplementation(
      () => new Promise(() => {}) // never resolves: keeps the queue occupied
    );

    queue.enqueue({
      kind: "update_set",
      opId: opId(),
      clientSetId: "server-5",
      data: { reps: 6 },
    });
    queue.enqueue({
      kind: "update_set",
      opId: opId(),
      clientSetId: "server-5",
      data: { reps: 8 },
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(updateSetMock).toHaveBeenCalledTimes(1);
    expect(updateSetMock).toHaveBeenCalledWith("server-5", { reps: 6 });
    queue.destroy();
  });
});
