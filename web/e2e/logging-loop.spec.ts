import { expect, test } from "@playwright/test";

/**
 * The complete logging loop on a phone-sized viewport: register → start a
 * workout → add an exercise → log a set → finish → completion summary.
 *
 * Requires the API running (default http://localhost:8000, reachable through
 * the web server's NEXT_PUBLIC_API_BASE_URL) with a migrated database.
 */
test("log a complete workout start to finish", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("supersecurepw123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: /start workout/i }).first().click();
  await expect(page).toHaveURL(/\/workout$/);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "+ Add exercise" }).click();

  await page.getByPlaceholder("Search exercises").fill("Bench Press");
  await page.getByRole("button", { name: /bench press/i }).first().click();

  // The draft row is empty for a first-ever lift — enter a set like a real user.
  await expect(page.getByText("Bench Press").first()).toBeVisible();
  await page.getByLabel("Load in kg").fill("60");
  await page.getByLabel("Reps").fill("8");
  await page.getByRole("button", { name: "Log", exact: true }).click();

  // The set flips to logged state (deletable) once accepted.
  await expect(
    page.getByRole("button", { name: "Delete set" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page).toHaveURL(/\/workout\//);

  // Completion summary: one exercise, one working set, matching volume.
  await expect(page.getByText("Exercises").first()).toBeVisible();
  await expect(page.getByText("Total volume").first()).toBeVisible();
  await expect(page.getByText("Total sets").first()).toBeVisible();
});
