import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BodyweightGate } from "./BodyweightGate";
import {
  notifyBodyweightRequired,
  notifyBodyweightSaved,
  onBodyweightSaved,
} from "@/lib/api/bodyweight-events";
import { updateBodyweight } from "@/lib/api/me";

vi.mock("@/lib/api/me", () => ({
  updateBodyweight: vi.fn(),
}));

const updateBodyweightMock = vi.mocked(updateBodyweight);

describe("BodyweightGate", () => {
  it("opens the sheet once per session and notifies subscribers on save", async () => {
    const user = userEvent.setup();
    updateBodyweightMock.mockResolvedValue({} as never);
    const saved: string[] = [];
    const unsub = onBodyweightSaved(() => saved.push("saved"));
    render(<BodyweightGate />);

    notifyBodyweightRequired();
    notifyBodyweightRequired(); // second event must not stack a second sheet
    const dialogs = await screen.findAllByRole("dialog");
    expect(dialogs).toHaveLength(1);

    await user.type(screen.getByLabelText("Body weight in kg"), "80");
    await user.click(screen.getByRole("button", { name: "Save & finish workout" }));

    await waitFor(() => expect(saved).toEqual(["saved"]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unsub();
  });

  it("stays hidden without any event", () => {
    render(<BodyweightGate />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    notifyBodyweightSaved();
  });
});
