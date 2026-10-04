import { test, expect, type Page } from "@playwright/test";
import { starterHabit } from "../../lib/habits";
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
async function createHabit(page: Page, name: string) {
  const h = {
    ...starterHabit("custom", await page.evaluate(()=>{const d=new Date();if(d.getHours()<4)d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;})),
    name,
    routine: "evening",
    timerMinutes: 1,
  };
  const r = await page.request.patch("/api/workspace", {
    data: {
      kind: "habit",
      key: `habit:${h.id}`,
      id: crypto.randomUUID(),
      expected: null,
      effectiveFrom: h.createdDate,
      data: h,
    },
  });
  expect(r.ok()).toBeTruthy();
  return h;
}
async function enableOffline(page: Page) {
  await page.goto("/settings");
  await page
    .getByLabel("New device passphrase")
    .fill("offline-test-passphrase");
  await page
    .getByRole("button", { name: "Enable offline storage", exact: true })
    .click();
  await expect(
    page.getByText("Device storage enabled · unlocked"),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect(page.getByText("All changes synced")).toBeVisible();
}
async function offlineUnlock(page: Page) {
  await page.locator("#pass").fill("offline-test-passphrase");
  await page.locator("#unlock-form button").click();
  await expect(page.locator("#habits")).toBeVisible();
}

test("personalised questions, outcomes, routine and saved experiment survive reload", async ({
  page,
}) => {
  await signIn(page);
  const h = await createHabit(page, "Evening reading experiment");
  await page.goto("/settings");
  const night = page.getByRole("group", {
    name: "Night quick check-in",
    exact: true,
  });
  for (const label of [
    "Stress",
    "Strength training",
    "Cardio",
    "Water",
    "Alcohol",
    "Time outside",
  ])
    await night.getByRole("checkbox", { name: label, exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect
    .poll(async () => {
      const d = await (await page.request.get("/api/workspace")).json();
      return d.records.find((r: { key: string }) => r.key === "preferences")
        ?.data.night;
    })
    .toEqual(["mood", "energy"]);
  await page.goto("/checkin/night");
  await expect(page.getByText(/of 2 answered/)).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: "Stress", exact: true }),
  ).toHaveCount(0);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Plan one adjustment", exact: true })
    .click();
  await page
    .getByLabel("One action to try")
    .fill("Read after dinner and observe energy");
  await page.getByLabel("Link a habit").selectOption(h.id);
  await page
    .getByRole("button", { name: "Save adjustment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Read after dinner and observe energy",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Read after dinner and observe energy",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start 1 min", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start 1 min", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
});

test("encrypted offline launch, durable habit and diary queue, replay and online sync", async ({
  page,
  context,
}) => {
  await signIn(page);
  const h = await createHabit(page, "Offline reading");
  await enableOffline(page);
  await context.setOffline(true);
  await page.goto("/habits");
  await offlineUnlock(page);
  await page
    .getByRole("button", { name: "Complete Offline reading", exact: true })
    .click();
  await expect(page.locator("#status")).toContainText("1 change");
  await page.reload();
  await offlineUnlock(page);
  await expect(
    page.getByRole("button", { name: "Undo Offline reading", exact: true }),
  ).toBeVisible();
  await page.locator("#period").selectOption("night");
  await page.locator("#q-mood").selectOption("4");
  await page.locator("#q-energy").selectOption("5");
  await page
    .getByRole("button", { name: "Save on device", exact: true })
    .click();
  await expect(page.locator("#status")).toContainText("2 changes");
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Sync and open app", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Good|Late one/ }),
  ).toBeVisible();
  await page
    .getByLabel("Device passphrase", { exact: true })
    .fill("offline-test-passphrase");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText("All changes synced")).toBeVisible();
  const d = await (await page.request.get("/api/workspace")).json();
  expect(
    d.habitData.logs.find((l: { habitId: string }) => l.habitId === h.id).value,
  ).toBe(1);
  expect(
    d.entries.find(
      (e: { date: string; period: string }) =>
        e.date === h.createdDate && e.period === "night",
    ).data.me.energy,
  ).toBe(5);
  // Queue is empty after repeated refresh, with one canonical log for the day.
  await page.reload();
  await page
    .getByLabel("Device passphrase", { exact: true })
    .fill("offline-test-passphrase");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText("All changes synced")).toBeVisible();
  const count = d.habitData.logs.filter(
    (l: { habitId: string }) => l.habitId === h.id,
  ).length;
  expect(count).toBe(1);
  await page.goto("/settings");
  await page
    .getByLabel("Device passphrase", { exact: true })
    .fill("offline-test-passphrase");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove device copy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable offline storage", exact: true }),
  ).toBeVisible();
});

test("conflicting offline change is retained until the user chooses the server version", async ({
  page,
  context,
}) => {
  await signIn(page);
  const h = await createHabit(page, "Conflicting reading");
  await enableOffline(page);
  await context.setOffline(true);
  await page.goto("/habits");
  await offlineUnlock(page);
  await page
    .getByRole("button", { name: "Complete Conflicting reading", exact: true })
    .click();
  const key = `log:${h.id}:${h.createdDate}`;
  const r = await page.request.patch("/api/workspace", {
    data: {
      kind: "log",
      key,
      id: crypto.randomUUID(),
      expected: null,
      data: { habitId: h.id, date: h.createdDate, value: 0, status: "logged" },
    },
  });
  expect(r.ok()).toBeTruthy();
  await context.setOffline(false);
  await page.goto("/");
  await page
    .getByLabel("Device passphrase", { exact: true })
    .fill("offline-test-passphrase");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "A change needs your review",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Compare changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load server version", exact: true })
    .click();
  await expect(page.getByText("Server version", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Use server version", exact: true })
    .click();
  await expect(page.getByText("All changes synced")).toBeVisible();
  const d = await (await page.request.get("/api/workspace")).json();
  expect(
    d.habitData.logs.find((l: { habitId: string }) => l.habitId === h.id).value,
  ).toBe(0);
  await page.goto("/settings");
  await page
    .getByLabel("Device passphrase", { exact: true })
    .fill("offline-test-passphrase");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove device copy", exact: true })
    .click();
});

test("connected sources are scoped, preserve manual corrections and can be revoked", async ({
  page,
}) => {
  await signIn(page);
  const h = await createHabit(page, "Connected reading");
  const created = await page.request.post("/api/integrations", {
    data: { name: "Test source", habitIds: [h.id] },
  });
  expect(created.ok()).toBeTruthy();
  const source = await created.json();
  const headers = { Authorization: `Bearer ${source.token}` },
    reading = { habitId: h.id, date: h.createdDate, value: 1 };
  expect(
    (
      await page.request.post("/api/ingest", {
        headers,
        data: { readings: [reading] },
      })
    ).ok(),
  ).toBeTruthy();
  let d = await (await page.request.get("/api/workspace")).json();
  const key = `log:${h.id}:${h.createdDate}`,
    expected = d.records.find((r: { key: string }) => r.key === key).revision;
  expect(
    (
      await page.request.patch("/api/workspace", {
        data: {
          kind: "log",
          key,
          id: crypto.randomUUID(),
          expected,
          data: { ...reading, value: 0, source: "manual" },
        },
      })
    ).ok(),
  ).toBeTruthy();
  const replay = await page.request.post("/api/ingest", {
    headers,
    data: { readings: [reading] },
  });
  expect(await replay.json()).toEqual({ imported: 0, skipped: 1 });
  await page.request.delete("/api/integrations", { data: { id: source.id } });
  expect(
    (
      await page.request.post("/api/ingest", {
        headers,
        data: { readings: [reading] },
      })
    ).status(),
  ).toBe(401);
  d = await (await page.request.get("/api/workspace")).json();
  expect(
    d.habitData.logs.find((l: { habitId: string }) => l.habitId === h.id).value,
  ).toBe(0);
});
