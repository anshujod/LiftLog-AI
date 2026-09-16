import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BodyweightSheet } from "./BodyweightSheet";
import { updateBodyweight } from "@/lib/api/me";
import { getUnitPreference } from "@/lib/units";

vi.mock("@/lib/api/me", () => ({
  updateBodyweight: vi.fn(),
}));

vi.mock("@/lib/units", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/units")>();
  return { ...actual, getUnitPreference: vi.fn().mockResolvedValue("kg") };
});

const updateBodyweightMock = vi.mocked(updateBodyweight);
const getUnitPreferenceMock = vi.mocked(getUnitPreference);

describe("BodyweightSheet", () => {
  it("sends grams and calls onSaved", async () => {
    const user = userEvent.setup();
    updateBodyweightMock.mockResolvedValue({} as never);
    const onSaved = vi.fn();
    render(<BodyweightSheet onClose={() => {}} onSaved={onSaved} />);

    await user.type(await screen.findByLabelText("Body weight in kg"), "80");
    await user.click(screen.getByRole("button", { name: "Save & finish workout" }));

    await waitFor(() => expect(updateBodyweightMock).toHaveBeenCalledWith(80000));
    expect(onSaved).toHaveBeenCalledWith(80000);
    expect(getUnitPreferenceMock).toHaveBeenCalled();
  });

  it("rejects non-positive input without calling the API", async () => {
    const user = userEvent.setup();
    updateBodyweightMock.mockClear();
    render(<BodyweightSheet onClose={() => {}} onSaved={() => {}} />);

    await user.type(await screen.findByLabelText("Body weight in kg"), "0");
    await user.click(screen.getByRole("button", { name: "Save & finish workout" }));

    expect(await screen.findByText(/Enter your body weight/)).toBeInTheDocument();
    expect(updateBodyweightMock).not.toHaveBeenCalled();
  });
});
