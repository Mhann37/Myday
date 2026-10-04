import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addDays } from "../../lib/dates";
import { starterHabit } from "../../lib/habits";
import { generateDemoEntries } from "../../scripts/demo-data";

async function versionedPut(
  page: Page,
  route: string,
  options: Parameters<APIRequestContext["put"]>[1],
) {
  const data = options?.data as Record<string, unknown>;
  const snapshot = await page.request.get("/api/workspace");
  const records = snapshot.ok() ? (await snapshot.json()).records : [];
  const key =
    route === "/api/habits"
      ? `habit:${data.id}`
      : `entry:${data.date}:${data.period}`;
  return page.request.put(route, {
    ...options,
    data: {
      ...data,
      expected:
        records.find((r: { key: string }) => r.key === key)?.revision ?? null,
    },
  });
}
async function versionedPatch(
  page: Page,
  route: string,
  options: Parameters<APIRequestContext["patch"]>[1],
) {
  const data = options?.data as Record<string, unknown>;
  const snapshot = await page.request.get("/api/workspace");
  const records = snapshot.ok() ? (await snapshot.json()).records : [];
  const key = `log:${data.habitId}:${data.date}`;
  return page.request.patch(route, {
    ...options,
    data: {
      ...data,
      expected:
        records.find((r: { key: string }) => r.key === key)?.revision ?? null,
    },
  });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("Passcode", { exact: true })
    .fill("e2e-local-only-passcode");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Good|Late one/ }),
  ).toBeVisible();
}

test("private app, habit lifecycle, failed-save rollback, exports, keyboard, and responsive layout", async ({
  page,
}) => {
  await page.goto("/habits");
  await expect(page).toHaveURL(/login/);
  await signIn(page);
  await page.goto("/habits");
  await page.getByRole("button", { name: "Add habit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Habit name" })
    .fill("Read before bed");
  const name = await page
    .getByRole("textbox", { name: "Habit name" })
    .inputValue();
  await page
    .getByRole("textbox", { name: "Make it easy to start" })
    .fill("After dinner, read a page");
  await page.getByRole("button", { name: "Create habit", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: `Complete ${name}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Undo ${name}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Undo ${name}`, exact: true }),
  ).toBeVisible();
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 500,
        json: { error: "Save failed. Please retry." },
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: `Undo ${name}`, exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Save failed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Undo ${name}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.unroute("**/api/workspace");
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await page
    .getByRole("button", { name: "Archive habit", exact: true })
    .click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Complete ${name}`, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Show archived habits" }).click();
  await page
    .getByText(name, { exact: true })
    .locator("..")
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(
    page.getByRole("button", { name: `Undo ${name}`, exact: true }),
  ).toBeVisible();
  const backupResponse = await page.request.get("/api/export?format=json");
  expect(backupResponse.ok()).toBeTruthy();
  const backup = await backupResponse.json();
  expect(backup.version).toBe(3);
  expect(
    backup.habits.some((h: { name: string }) => h.name === name),
  ).toBeTruthy();
  expect(backup.logs.length).toBeGreaterThan(0);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Today’s habits" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        accessibility.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    }
  }
});

test("linked counters, corrections, backup restore, validation, and sign-out", async ({
  page,
}) => {
  await signIn(page);
  const today = await page.evaluate(() => {
    const d = new Date();
    if (d.getHours() < 4) d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const habit = starterHabit("water", addDays(today, -10));
  const created = await versionedPut(page, "/api/habits", { data: habit });
  expect(created.ok()).toBeTruthy();
  const diaryResponse = await page.request.get("/api/entries");
  const diary = (await diaryResponse.json()).entries;
  const night = diary.find(
    (e: { date: string; period: string }) =>
      e.date === today && e.period === "night",
  );
  expect(
    (
      await versionedPut(page, "/api/entries", {
        data: {
          date: today,
          period: "night",
          data: { ...night?.data, habits: { ...night?.data.habits, water: 6 } },
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/habits");
  await page
    .getByRole("button", { name: "Add 1 glasses to Water", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set Water amount", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Amount (glasses)" }),
  ).toHaveValue("7");
  await page
    .getByRole("button", { name: "Clear quick log", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set Water amount", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Amount (glasses)" }),
  ).toHaveValue("6");
  await page.getByRole("spinbutton", { name: "Amount (glasses)" }).fill("8");
  await page.getByRole("button", { name: "Save amount", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Set Water amount", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Set Water amount", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Water,.*not logged/ })
    .first()
    .click();
  await page.getByRole("spinbutton", { name: "Amount (glasses)" }).fill("8");
  await page.getByRole("button", { name: "Save amount", exact: true }).click();
  const exported = await (
    await page.request.get("/api/export?format=json")
  ).json();
  expect(
    (await page.request.post("/api/import", { data: exported })).ok(),
  ).toBeTruthy();
  expect(
    await (await page.request.post("/api/import", { data: exported })).json(),
  ).toEqual({ entriesAdded: 0, habitsAdded: 0, logsAdded: 0 });
  const restoreHabit = {
    ...starterHabit("custom", today),
    name: "Stretch for 5 minutes",
  };
  const restore = {
    entries: [],
    habits: [restoreHabit],
    logs: [
      {
        habitId: restoreHabit.id,
        date: today,
        value: 1,
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  await page.goto("/settings");
  await page.locator('input[type="file"]').setInputFiles({
    name: "myday-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(restore)),
  });
  await expect(
    page.getByText("Ready to restore", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore missing records", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Restored 0 check-ins, 1 habits, and 1 quick logs" }),
  ).toBeVisible();
  expect(
    (
      await versionedPut(page, "/api/entries", {
        data: { date: "2026-02-30", period: "night", data: {} },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await versionedPatch(page, "/api/habits", {
        data: { habitId: habit.id, date: today, value: 50 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await versionedPut(page, "/api/habits", {
        headers: { Origin: "https://untrusted.example" },
        data: habit,
      })
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: /Sign out/ }).click();
  await expect(page).toHaveURL(/login/);
  expect((await page.request.get("/api/habits")).status()).toBe(401);
});

test("representative diary renders without browser errors and has an accessible mobile and desktop experience", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await signIn(page);
  const today = await page.evaluate(() => {
    const d = new Date();
    if (d.getHours() < 4) d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  for (const entry of generateDemoEntries(today, 30))
    expect(
      (await versionedPut(page, "/api/entries", { data: entry })).ok(),
    ).toBeTruthy();
  const movement = starterHabit("exercised", addDays(today, -30));
  movement.cue = "After work, change into training gear";
  expect(
    (await versionedPut(page, "/api/habits", { data: movement })).ok(),
  ).toBeTruthy();
  for (const [viewport, colorScheme] of [
    [{ width: 1440, height: 1100 }, "light"],
    [{ width: 390, height: 844 }, "light"],
    [{ width: 390, height: 844 }, "dark"],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme });
    for (const path of ["/", "/habits", "/insights", "/history", "/settings"]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      if (path === "/" && colorScheme === "light")
        await page.screenshot({
          path: `artifacts/myday-${viewport.width > 1000 ? "desktop" : "mobile"}.png`,
          fullPage: true,
        });
    }
  }
  expect(errors).toEqual([]);
});

test("quick check-in keeps full diary data, drafts survive reload, and save is confirmed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/checkin/night");
  for (const [name, index] of [
    ["Mood", 3],
    ["Energy", 3],
    ["Stress", 1],
  ] as const) {
    const answer = page
      .getByRole("radiogroup", { name, exact: true })
      .getByRole("radio")
      .nth(index);
    if ((await answer.getAttribute("aria-checked")) !== "true")
      await answer.click();
  }
  await page
    .getByRole("textbox", { name: "One win", exact: true })
    .fill(`A saved draft ${Date.now()}`);
  await expect(
    page.getByText("Draft saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("radiogroup", { name: "Mood", exact: true })
      .getByRole("radio")
      .nth(3),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Full diary", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Preserve this full diary note");
  await page
    .getByRole("button", { name: "Quick check-in", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Save night check-in|Update check-in/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Night check-in saved" }),
  ).toBeVisible();
  await page.goto("/checkin/night");
  await page.getByRole("button", { name: "Full diary", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Notes", exact: true }),
  ).toHaveValue("Preserve this full diary note");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});

test("an open check-in stays on its original day across the 4am rollover", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-04T16:59:50Z") }); // 03:59:50 AEDT, 5 October
  await signIn(page);
  await page.goto("/checkin/night");
  await expect(
    page.getByText("Sunday 4 October", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(45_000);
  await expect(
    page.getByText("Sunday 4 October", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "One win", exact: true })
    .fill("Saved to the day this check-in started");
  const saved = page.waitForRequest(
    (req) => req.url().includes("/api/workspace") && req.method() === "PATCH",
  );
  await page
    .getByRole("button", { name: /Save night check-in|Update check-in/ })
    .click();
  expect((await saved).postDataJSON().data.date).toBe("2026-10-04");
  await expect(
    page.getByText("Monday 5 October", { exact: false }),
  ).toBeVisible();
});
