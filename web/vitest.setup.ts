import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  // Drop module-level GET + /me caches so tests never see each other's data.
  const client = await import("@/lib/api/client").catch(() => null);
  client?.clearApiCache?.();
  const me = await import("@/lib/api/me").catch(() => null);
  me?.resetMeCache?.();
  const units = await import("@/lib/units").catch(() => null);
  units?.resetUnitPreferenceCache?.();
});
