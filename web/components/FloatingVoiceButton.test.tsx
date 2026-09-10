import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingVoiceButton } from "./FloatingVoiceButton";

describe("FloatingVoiceButton", () => {
  it("starts listening on press", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<FloatingVoiceButton listening={false} onPress={onPress} />);

    await user.click(screen.getByRole("button", { name: "Log sets by voice" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("switches to a stop affordance while listening", () => {
    render(<FloatingVoiceButton listening onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Stop listening" })).toHaveAttribute("aria-pressed", "true");
  });

  it("respects disabled while the exercise library loads", () => {
    render(<FloatingVoiceButton listening={false} disabled onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Log sets by voice" })).toBeDisabled();
  });
});
