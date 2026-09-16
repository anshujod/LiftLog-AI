import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileScreen } from "./ProfileScreen";
import { getMe, updateBodyweight, updateUnitPreference } from "@/lib/api/me";
import { notifyBodyweightSaved } from "@/lib/api/bodyweight-events";

vi.mock("@/lib/api/me", () => ({
  getMe: vi.fn(),
  updateBodyweight: vi.fn(),
  updateUnitPreference: vi.fn(),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock("@/lib/api/bodyweight-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/bodyweight-events")>();
  return { ...actual, notifyBodyweightSaved: vi.fn() };
});

const getMeMock = vi.mocked(getMe);
const updateBodyweightMock = vi.mocked(updateBodyweight);
const updateUnitPreferenceMock = vi.mocked(updateUnitPreference);
const notifySavedMock = vi.mocked(notifyBodyweightSaved);

function me(bodyweightG: number | null = null) {
  return {
    id: "user-1",
    email: "lifter@example.com",
    unit_preference: "kg",
    bodyweight_g: bodyweightG,
  } as never;
}

describe("ProfileScreen", () => {
  it("loads account, saves body weight in grams, and notifies", async () => {
    const user = userEvent.setup();
    getMeMock.mockResolvedValue(me(null));
    updateBodyweightMock.mockResolvedValue(me(80000));
    render(<ProfileScreen />);

    expect(await screen.findByText("lifter@example.com")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Body weight in kg"), "80");
    await user.click(screen.getByRole("button", { name: "Save body weight" }));

    await waitFor(() => expect(updateBodyweightMock).toHaveBeenCalledWith(80000));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(notifySavedMock).toHaveBeenCalled();
  });

  it("switches units and re-renders the saved weight", async () => {
    const user = userEvent.setup();
    getMeMock.mockResolvedValue(me(80000));
    updateUnitPreferenceMock.mockResolvedValue(me(80000));
    render(<ProfileScreen />);

    const input = (await screen.findByLabelText("Body weight in kg")) as HTMLInputElement;
    expect(input.value).toBe("80");

    await user.click(screen.getByRole("radio", { name: "Pounds (lb)" }));
    await waitFor(() => expect(updateUnitPreferenceMock).toHaveBeenCalledWith("lb"));
    expect((await screen.findByLabelText("Body weight in lb") as HTMLInputElement).value).toBe(
      "176.4"
    );
  });

  it("retries after a load failure", async () => {
    const user = userEvent.setup();
    getMeMock.mockRejectedValueOnce(new Error("offline"));
    getMeMock.mockResolvedValueOnce(me(null));
    render(<ProfileScreen />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByText("lifter@example.com")).toBeInTheDocument()
    );
  });
});
