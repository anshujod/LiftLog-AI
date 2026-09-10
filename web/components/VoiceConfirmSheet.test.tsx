import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoiceConfirmSheet } from "./VoiceConfirmSheet";
import type { VoiceLogCommand } from "@/lib/voice/parse";
import type { Exercise, LoadType } from "@/lib/api/exercises";

function ex(name: string, loadType: LoadType, id: string): Exercise {
  return {
    id,
    muscle_group_id: 1,
    name,
    load_type: loadType,
    progression_metric: "e1rm",
    default_increment_g: 2500,
    is_active: true,
    is_custom: false,
  };
}

const LIBRARY = [ex("Bench Press", "barbell_total", "bench"), ex("Pull-ups", "bodyweight", "pullups")];

const baseCommand: VoiceLogCommand = {
  kind: "log",
  transcript: "bench 60 3 sets of 8",
  exerciseId: "bench",
  exerciseName: "Bench Press",
  exercisePhrase: "bench",
  candidates: [],
  loadG: 60000,
  reps: 8,
  sets: 3,
  isWarmup: false,
  confidence: "high",
};

describe("VoiceConfirmSheet", () => {
  it("confirms parsed values into the sync queue payload", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <VoiceConfirmSheet command={baseCommand} library={LIBRARY} unit="kg" onConfirm={onConfirm} onClose={() => {}} />
    );

    expect(screen.getByText("Bench Press", { exact: false })).toBeInTheDocument();
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
    expect(screen.getByDisplayValue("8")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm and log" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      exerciseId: "bench",
      loadG: 60000,
      reps: 8,
      sets: 3,
      isWarmup: false,
    });
  });

  it("warns on low confidence and offers disambiguation picks", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <VoiceConfirmSheet
        command={{
          ...baseCommand,
          exerciseId: null,
          exerciseName: null,
          candidates: [
            { id: "bench", name: "Bench Press" },
            { id: "pullups", name: "Pull-ups" },
          ],
          confidence: "low",
        }}
        library={LIBRARY}
        unit="kg"
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/nothing is saved until you confirm/i);
    await user.click(screen.getByRole("button", { name: "Pull-ups" }));
    await user.click(screen.getByRole("button", { name: "Confirm and log" }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ exerciseId: "pullups", loadG: 0 }));
  });

  it("forces zero load for bodyweight exercises", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <VoiceConfirmSheet
        command={{ ...baseCommand, exerciseId: "pullups", exerciseName: "Pull-ups", loadG: 0, reps: 10, sets: 1 }}
        library={LIBRARY}
        unit="kg"
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    expect(screen.queryByLabelText(/weight in/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm and log" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseId: "pullups", loadG: 0, reps: 10 }),
    );
  });

  it("blocks confirm on invalid reps", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <VoiceConfirmSheet command={baseCommand} library={LIBRARY} unit="kg" onConfirm={onConfirm} onClose={() => {}} />
    );

    await user.clear(screen.getByLabelText("Reps"));
    await user.click(screen.getByRole("button", { name: "Confirm and log" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/reps must be at least 1/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
