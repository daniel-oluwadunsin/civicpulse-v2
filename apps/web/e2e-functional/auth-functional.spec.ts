import { expect, test } from "@playwright/test";

test("landing reads live public metrics through the configured API origin", async ({
  page,
}) => {
  const response = await page.request.get(
    "http://localhost:4010/api/v1/public/overview",
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: { incidents: number } };
  await page.goto("/");
  await expect(page.locator("dl dd").first()).toHaveText(
    String(body.data.incidents),
  );
});

test("anonymous reporting, persistent sessions, role denial and logout work end to end", async ({
  page,
}) => {
  await page.goto("/report");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Freport$/);

  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register\?returnTo=%2Freport$/);
  const email = `browser-${crypto.randomUUID()}@example.test`;
  await page.getByLabel("Display name").fill("Browser QA Citizen");
  await page.getByLabel("Email address").fill(email);
  await page
    .locator('input[name="password"]')
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(
    page.getByRole("heading", { name: /What needs attention/i }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/report$/);
  await page.goto("/government");
  await expect(
    page.getByRole("heading", {
      name: "This workspace is not available to your account.",
    }),
  ).toBeVisible();

  await page.goto("/incidents");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("http://localhost:4174/");
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fprofile$/);
});

test("organization onboarding cannot be self-started", async ({ page }) => {
  await page.goto("/organizations/onboard");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
});
