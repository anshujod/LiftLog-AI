import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MuscleMap } from "./MuscleMap";
import { ALL_MUSCLE_SLUGS, GROUP_HUE } from "./muscleMeta";
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
    const { container } = render(<MuscleMap groups={GROUPS} periodLabel="past week" />);

    expect(screen.getByText(/2\/7 muscle groups · past week/)).toBeInTheDocument();
    expect(screen.getByLabelText("Front body muscle map")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Back" }));
    const backSvg = screen.getByLabelText("Back body muscle map");
    expect(backSvg).toBeInTheDocument();
    // Back view shows the trained back region; chest lives on the front view.
    expect(within(backSvg as unknown as HTMLElement).getByLabelText(/Back, trained/)).toBeInTheDocument();

    // Every rendered muscle region maps to a known slug.
    const rendered = Array.from(container.querySelectorAll("[data-muscle]")).map((el) =>
      el.getAttribute("data-muscle")
    );
    expect(rendered.length).toBeGreaterThan(0);
    for (const slug of rendered) {
      expect(ALL_MUSCLE_SLUGS).toContain(slug);
    }
  });

  it("shows detail when a muscle is tapped", async () => {
    const user = userEvent.setup();
    render(<MuscleMap groups={GROUPS} periodLabel="past week" />);

    await user.click(screen.getByLabelText(/Chest, trained/));
    const detail = screen.getByText(/10 sets/).closest("div");
    expect(within(detail as unknown as HTMLElement).getByText("Chest")).toBeInTheDocument();
    expect(screen.getByText(/10 sets/)).toBeInTheDocument();
  });

  it("selects a group from the legend chips", async () => {
    const user = userEvent.setup();
    render(<MuscleMap groups={GROUPS} periodLabel="past week" />);

    const legend = screen.getByLabelText("Muscle group legend");
    await user.click(within(legend as unknown as HTMLElement).getByRole("button", { name: "Back" }));
    expect(screen.getByText(/4 sets/)).toBeInTheDocument();
  });

  it("covers every slug with a hue", () => {
    for (const slug of ALL_MUSCLE_SLUGS) {
      expect(GROUP_HUE[slug]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
