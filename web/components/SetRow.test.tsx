import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetRow } from "./SetRow";

const base = { load_g: 100000, reps: 5, is_warmup: false };

describe("SetRow", () => {
  it("saves a draft with the entered load and reps", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SetRow unit="kg" incrementG={2500} initial={base} mode="draft" onSave={onSave} />
    );

    await user.click(screen.getByRole("button", { name: /increase by 2\.5 kg/i }));
    await user.click(screen.getByRole("button", { name: "Log" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ load_g: 102500, reps: 5, is_warmup: false });
  });

  it("stepping down never drops the load below zero", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SetRow
        unit="kg"
        incrementG={2500}
        initial={{ load_g: 0, reps: 8, is_warmup: false }}
        mode="logged"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /decrease by 2\.5 kg/i }));

    expect(onChange).toHaveBeenCalledWith({ load_g: 0, reps: 8, is_warmup: false });
  });

  it("toggles the warmup flag and reports it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SetRow unit="kg" incrementG={2500} initial={base} mode="logged" onChange={onChange} />
    );

    const warmup = screen.getByRole("button", { name: "W" });
    expect(warmup).toHaveAttribute("aria-pressed", "false");
    await user.click(warmup);

    expect(warmup).toHaveAttribute("aria-pressed", "true");
    expect(onChange).toHaveBeenCalledWith({ load_g: 100000, reps: 5, is_warmup: true });
  });

  it("rejects invalid typed input and keeps the last good value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SetRow unit="kg" incrementG={2500} initial={base} mode="logged" onChange={onChange} />
    );

    const reps = screen.getByRole("textbox", { name: "Reps" });
    await user.clear(reps);
    await user.type(reps, "abc");
    await user.tab(); // blur commits

    expect(onChange).toHaveBeenCalledWith({ load_g: 100000, reps: 5, is_warmup: false });
    expect(reps).toHaveValue("5");
  });

  it("shows a syncing indicator for pending sets and delete in logged mode", () => {
    const onDelete = vi.fn();
    render(
      <SetRow
        unit="kg"
        incrementG={2500}
        initial={base}
        mode="logged"
        syncStatus="pending"
        onDelete={onDelete}
      />
    );

    expect(screen.getByLabelText("Syncing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log" })).not.toBeInTheDocument();
  });
});
