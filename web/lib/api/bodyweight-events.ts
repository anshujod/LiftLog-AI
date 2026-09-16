import { ApiError } from "./errors";

export const BODYWEIGHT_REQUIRED_CODE = "bodyweight_required";

type Listener = () => void;

const requiredListeners = new Set<Listener>();
const savedListeners = new Set<Listener>();

function subscribe(set: Set<Listener>, listener: Listener): () => void {
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

function emit(set: Set<Listener>): void {
  for (const listener of Array.from(set)) {
    try {
      listener();
    } catch {
      // one bad subscriber must not break the others
    }
  }
}

/** Fired when any API call fails with `bodyweight_required`. Opens the gate sheet. */
export function notifyBodyweightRequired(): void {
  emit(requiredListeners);
}

export function onBodyweightRequired(listener: Listener): () => void {
  return subscribe(requiredListeners, listener);
}

/** Fired after body weight is saved. Cards use it to auto-retry their loads. */
export function notifyBodyweightSaved(): void {
  emit(savedListeners);
}

export function onBodyweightSaved(listener: Listener): () => void {
  return subscribe(savedListeners, listener);
}

/** Returns true (and notifies the gate) when `err` is the missing-bodyweight 422. */
export function isBodyweightRequired(err: unknown): boolean {
  const hit = err instanceof ApiError && err.code === BODYWEIGHT_REQUIRED_CODE;
  if (hit) notifyBodyweightRequired();
  return hit;
}
