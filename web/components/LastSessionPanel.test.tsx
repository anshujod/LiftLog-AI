import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LastSessionPanel } from "./LastSessionPanel";
import { getLastSession } from "@/lib/api/exercises";
import type { LastSession } from "@/lib/api/exercises";
import { ApiError } from "@/lib/api/errors";

vi.mock("@/lib/api/exercises", () => ({
  getLastSession: vi.fn(),
}));

const getLastSessionMock = vi.mocked(getLastSession);

function loadedSession(): LastSession {
  return {
    has_data: true,
    session: {
      id: "session-1",
      performed_on: "2026-09-01",
      sets: [
        {
          id: "set-1",
          load: { grams: 100000, display: "100 kg" },
          reps: 5,
          is_warmup: false,
        },
        {
          id: "set-2",
          load: { grams: 60000, display: "60 kg" },
          reps: 8,
          is_warmup: true,
        },
      ],
    },
    bests: {
      weight_pr: {
        load: { grams: 100000, display: "100 kg" },
        reps: 5,
      },
      e1rm_pr: {
        estimated_1rm: { grams: 112500, display: "112.5 kg" },
      },
    },
  } as unknown as LastSession;
}

describe("LastSessionPanel", () => {
  it("shows a skeleton while loading, then the working sets", async () => {
    getLastSessionMock.mockImplementation(
      () => new Promise(() => {}) // stays pending on first render
    );
    const { unmount } = render(<LastSessionPanel exerciseId="ex-1" />);
    expect(screen.getByLabelText("Loading last session")).toBeInTheDocument();
    unmount();
  });

  it("renders sets with warmups de-emphasized, plus bests", async () => {
    getLastSessionMock.mockResolvedValue(loadedSession());
    render(<LastSessionPanel exerciseId="ex-1" />);

    await waitFor(() => {
      // Once in the set list, once under "Personal best".
      expect(screen.getAllByText("100 kg × 5")).toHaveLength(2);
    });
    expect(screen.getByText("Warmup")).toBeInTheDocument();
    expect(screen.getByText("Personal best")).toBeInTheDocument();
    expect(screen.getByText("Est. 1RM")).toBeInTheDocument();
  });

  it("renders a helpful empty state for a never-performed exercise", async () => {
    getLastSessionMock.mockResolvedValue({
      has_data: false,
      session: null,
      bests: {},
    } as unknown as LastSession);
    render(<LastSessionPanel exerciseId="ex-new" />);

    await waitFor(() => {
      expect(screen.getByText("First time logging this one?")).toBeInTheDocument();
    });
  });

  it("renders an inline error instead of crashing when the fetch fails", async () => {
    getLastSessionMock.mockRejectedValue(new ApiError(500, "server_error", "Boom"));
    render(<LastSessionPanel exerciseId="ex-err" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    });
  });
});
