import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecoveryCard } from "./RecoveryCard";
import { RecoveryTeaser } from "./RecoveryTeaser";
import { getMuscleRecovery, type MuscleRecovery } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/errors";

vi.mock("@/lib/api/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/analytics")>();
  return { ...actual, getMuscleRecovery: vi.fn() };
});

const getMuscleRecoveryMock = vi.mocked(getMuscleRecovery);

function recovery(): MuscleRecovery[] {
  const rows: [string, string, "ready" | "recovering" | "rest", number][] = [
    ["chest", "Chest", "ready", 100],
    ["back", "Back", "recovering", 81],
    ["legs", "Legs", "rest", 10],
    ["shoulders", "Shoulders", "recovering", 60],
    ["biceps", "Biceps", "ready", 100],
    ["triceps", "Triceps", "ready", 100],
    ["abs", "Abs", "ready", 100],
  ];
  return rows.map(([slug, name, status, percent]) => ({
    muscle_group_slug: slug,
    muscle_group_name: name,
    status,
    percent,
    last_trained_on: "2026-09-14",
  })) as MuscleRecovery[];
}

describe("RecoveryCard", () => {
  it("shows recovering count, avatars, legend, and grouped rows", async () => {
    getMuscleRecoveryMock.mockResolvedValue(recovery());
    render(<RecoveryCard />);

    expect(await screen.findByText("2 recovering · 1 need rest")).toBeInTheDocument();
    expect(screen.getByLabelText("Front body muscle map")).toBeInTheDocument();
    expect(screen.getByLabelText("Back body muscle map")).toBeInTheDocument();
    expect(screen.getByLabelText("Recovery legend")).toBeInTheDocument();
    expect(screen.getByText("Upper body")).toBeInTheDocument();
    expect(screen.getByText("Lower body")).toBeInTheDocument();
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument();
  });

  it("shows detail when a row is tapped and collapses", async () => {
    const user = userEvent.setup();
    getMuscleRecoveryMock.mockResolvedValue(recovery());
    render(<RecoveryCard />);

    await user.click(await screen.findByRole("button", { name: /Back.*81%/ }));
    expect(screen.getByText(/trained /)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse recovery status" }));
    expect(screen.queryByLabelText("Recovery legend")).not.toBeInTheDocument();
  });

  it("names rest-only state instead of claiming all-ready", async () => {
    getMuscleRecoveryMock.mockReset();
    getMuscleRecoveryMock.mockResolvedValue(
      recovery().map((g) =>
        g.status === "recovering" ? { ...g, status: "rest" as const, percent: 10 } : g
      )
    );
    render(<RecoveryCard />);

    expect(await screen.findByText("3 need rest")).toBeInTheDocument();
    expect(screen.queryByText("All muscle groups ready")).not.toBeInTheDocument();
  });

  it("retries after failure", async () => {
    const user = userEvent.setup();
    getMuscleRecoveryMock.mockReset();
    getMuscleRecoveryMock.mockRejectedValueOnce(new ApiError(0, "network", "offline"));
    getMuscleRecoveryMock.mockResolvedValue(recovery());
    render(<RecoveryCard />);

    await user.click(await screen.findByRole("button", { name: "Retry" }, { timeout: 3000 }));
    await waitFor(() => expect(screen.getByText("2 recovering · 1 need rest")).toBeInTheDocument());
  });
});

describe("RecoveryTeaser", () => {
  it("renders counts and stays silent with nothing to report", async () => {
    getMuscleRecoveryMock.mockReset();
    getMuscleRecoveryMock.mockResolvedValue(recovery());
    const { unmount } = render(<RecoveryTeaser />);
    expect(await screen.findByText("2 recovering")).toBeInTheDocument();
    unmount();

    getMuscleRecoveryMock.mockResolvedValue(
      recovery().map((g) => ({ ...g, status: "ready" as const, percent: 100 }))
    );
    render(<RecoveryTeaser />);
    await waitFor(() => expect(getMuscleRecoveryMock).toHaveBeenCalled());
    expect(screen.queryByText(/recovering/)).not.toBeInTheDocument();
  });
});
