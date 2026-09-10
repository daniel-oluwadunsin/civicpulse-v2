import { expect, test, type Page } from "@playwright/test";

const incident = {
  id: "11111111-1111-4111-8111-111111111111",
  public_reference: "CP-2026-0184",
  title: "Damaged pedestrian bridge near the market",
  summary:
    "Broken access panels are forcing pedestrians into the road during peak market hours.",
  category: "ROADS",
  official_status: "ACKNOWLEDGED",
  community_verification_status: "UNVERIFIED",
  report_count: 12,
  affected_count: 38,
  comment_count: 9,
  reaction_score: 16,
  lga_name: "Surulere",
  state_name: "Lagos",
  first_reported_at: "2026-09-08T09:00:00.000Z",
  organizations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Lagos Public Works",
      kind: "GOVERNMENT",
      verified: true,
      role: "PRIMARY",
    },
  ],
  latest_update: {
    title: "Inspection team scheduled",
    createdAt: "2026-09-09T12:00:00.000Z",
  },
};

async function mockPublicApi(page: Page) {
  await page.route("http://localhost:4000/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    let pageData: unknown;
    if (url.pathname.endsWith("/auth/me"))
      data = {
        user: {
          email: "citizen@example.com",
          platformRole: null,
          displayName: "Ada",
        },
        organizations: [],
      };
    else if (url.pathname.endsWith("/public/overview"))
      data = {
        incidents: 284,
        reports: 713,
        organizations: 46,
        resolved: 91,
        recentIncidents: [incident],
      };
    else if (url.pathname.endsWith("/incidents/filter-options"))
      data = {
        areas: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Lagos",
            type: "STATE",
          },
        ],
        organizations: incident.organizations,
      };
    else if (url.pathname.endsWith("/incidents")) {
      data = [incident];
      pageData = { nextCursor: null };
    } else if (url.pathname.endsWith("/organizations/onboarding-options"))
      data = {
        jurisdictions: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Lagos",
            type: "STATE",
          },
        ],
        organizations: [],
      };
    else if (url.pathname.includes("/organization-invitations/"))
      data = {
        email: "a•••@example.com",
        kind: "GOVERNMENT",
        organizationName: "Invited Public Works Agency",
        status: "PENDING",
        expiresAt: "2026-09-17T12:00:00.000Z",
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, ...(pageData ? { page: pageData } : {}) }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockPublicApi(page);
  await page.addInitScript(() =>
    localStorage.setItem("civicpulse-theme", "light"),
  );
});

test("landing, feed, auth and onboarding visual baselines", async ({
  page,
}, testInfo) => {
  for (const [path, name] of [
    ["/", "landing"],
    ["/incidents", "feed"],
    ["/login", "login"],
    [
      "/organizations/onboard?token=visual-test-invitation-token-00000001",
      "onboarding",
    ],
  ] as const) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(
      `${name}-${testInfo.project.name}.png`,
      { fullPage: name !== "landing" },
    );
  }
});

test("mobile shell and feed controls remain usable", async ({
  page,
}, testInfo) => {
  test.skip(
    !["mobile", "tablet"].includes(testInfo.project.name),
    "Mobile shell assertion",
  );
  await page.goto("/incidents");
  await expect(page.locator(".bottom-nav a.active")).toHaveCount(1);
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible();
  await page.getByRole("button", { name: "Close filters" }).click();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("light and dark modes preserve readable primary surfaces", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Switch to dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("government and NGO operational dashboards have responsive visual baselines", async ({
  page,
}, testInfo) => {
  const government = {
    id: "44444444-4444-4444-8444-444444444444",
    kind: "GOVERNMENT",
    role: "MANAGER",
    display_name: "Lagos Public Works",
    active: true,
    verification_status: "VERIFIED",
    onboarding_status: "APPROVED",
  };
  await page.route("http://localhost:4000/api/v1/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user: {
            email: "manager@example.com",
            platformRole: null,
            displayName: "Operations lead",
          },
          organizations: [government],
        },
      }),
    }),
  );
  await page.route(
    "http://localhost:4000/api/v1/government/incidents**",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: [{ ...incident, role: "PRIMARY" }] }),
      }),
  );
  await page.goto("/government");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(
    `government-${testInfo.project.name}.png`,
    { fullPage: true },
  );

  await page.unroute("http://localhost:4000/api/v1/auth/me");
  const ngo = {
    id: "55555555-5555-4555-8555-555555555555",
    kind: "NGO",
    role: "MANAGER",
    display_name: "Safe Streets Initiative",
    active: true,
    verification_status: "VERIFIED",
    onboarding_status: "APPROVED",
  };
  await page.route("http://localhost:4000/api/v1/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user: {
            email: "ngo@example.com",
            platformRole: null,
            displayName: "Programme lead",
          },
          organizations: [ngo],
        },
      }),
    }),
  );
  await page.route("http://localhost:4000/api/v1/ngo/issues**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ ...incident, affected_count: 38, intervention_count: 1 }],
      }),
    }),
  );
  await page.goto("/ngo");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`ngo-${testInfo.project.name}.png`, {
    fullPage: true,
  });
});
