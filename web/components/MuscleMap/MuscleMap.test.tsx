import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MuscleMap } from "./MuscleMap";
import type { MuscleGroupVolume } from "@/lib/api/analytics";

function group(slug: string, name: string, sets: number): MuscleGroupVolume {
  return {
    muscle_group_slug: slug,
    muscle_group_name: name,
    volume: { grams: sets * 400_000, display: `${sets * 400} kg` },
    working_set_count: sets,
    last_trained_on: "2026-09-10",
  } as MuscleGroupVolume;
}

const GROUPS = [group("chest", "Chest", 10), group("back", "Back", 4)];

describe("MuscleMap", () => {
  it("renders front view with coverage count and switches to back", async () => {
    const user = userEvent.setup();
    render(<MuscleMap groups={GROUPS} periodLabel="past week" />);

    expect(screen.getByText(/2\/7 muscle groups · past week/)).toBeInTheDocument();
    expect(screen.getByLabelText("Front body muscle map")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Back" }));
    expect(screen.getByLabelText("Back body muscle map")).toBeInTheDocument();
    // Back view shows the trained back region; chest lives on the front view.
    expect(screen.getByLabelText(/Back, trained/)).toBeInTheDocument();
  });

  it("shows detail when a muscle is tapped", async () => {
    const user = userEvent.setup();
    render(<MuscleMap groups={GROUPS} periodLabel="past week" />);

    await user.click(screen.getByLabelText(/Chest, trained/));
    expect(screen.getByText("Chest")).toBeInTheDocument();
    expect(screen.getByText(/10 sets/)).toBeInTheDocument();
  });
});
