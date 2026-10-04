import * as vault from "./vault.js";
let payload;
const $ = (id) => document.getElementById(id);
function today() {
  const d = new Date();
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function goal(h, date) {
  return (
    [...(h.goals ?? [])]
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      .find((g) => g.effectiveFrom <= date) ?? h
  );
}
function diaryValue(h, date) {
  const es = payload.snapshot.entries.filter((e) => e.date === date),
    n = es.find((e) => e.period === "night")?.data,
    m = es.find((e) => e.period === "morning")?.data;
  const map = {
    water: n?.habits?.water,
    steps: n?.habits?.steps,
    outdoorMins: n?.habits?.outdoorMins,
    sleepHours: m?.sleep?.hours,
    lifted: n?.training?.lifted,
    wifeTime: n?.mind?.wifeTime,
  };
  if (h.source === "exercised") {
    if (n?.training?.lifted === true || n?.training?.cardio === true) return 1;
    if (n?.training?.lifted === false && n?.training?.cardio === false)
      return 0;
    return undefined;
  }
  const v = map[h.source];
  return typeof v === "boolean" ? Number(v) : v;
}
function render() {
  $("status").textContent =
    `${payload.queue.length} change${payload.queue.length === 1 ? "" : "s"} saved on device. ${navigator.onLine ? "Ready to sync." : "Reconnect to sync."}`;
  $("unlock").hidden = true;
  for (const id of ["habits", "checkin", "sync", "lock"]) $(id).hidden = false;
  const list = $("list");
  list.replaceChildren();
  const date = today(),
    weekday = (new Date(date + "T12:00:00").getDay() + 6) % 7;
  for (const h of payload.snapshot.habitData.habits
    .filter((h) => !h.archived)
    .sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
        (a.order ?? 0) - (b.order ?? 0),
    )) {
    const g = goal(h, date);
    if (
      date < h.createdDate ||
      (h.pauses ?? []).some((p) => date >= p.from && date <= p.to) ||
      (g.schedule === "daily" && !g.days.includes(weekday))
    )
      continue;
    const log = payload.snapshot.habitData.logs.find(
      (l) => l.habitId === h.id && l.date === date,
    );
    if (log?.status === "excused") continue;
    const v = log?.value ?? diaryValue(h, date),
      done = v !== undefined && v >= g.target,
      row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = h.name;
    const small = document.createElement("small");
    small.textContent =
      h.kind === "count"
        ? `${v ?? "—"} / ${g.target} ${h.unit}`
        : done
          ? "Done for today"
          : "Ready when you are";
    label.append(small);
    row.append(label);
    const button = document.createElement("button");
    button.textContent =
      h.kind === "count" ? `+${h.step}` : done ? "Undo" : "Done";
    button.setAttribute(
      "aria-label",
      h.kind === "count"
        ? `Add to ${h.name}`
        : `${done ? "Undo" : "Complete"} ${h.name}`,
    );
    button.onclick = async () => {
      button.disabled = true;
      try {
        const key = `log:${h.id}:${date}`,
          value =
            h.kind === "count"
              ? Math.min(
                  {
                    water: 40,
                    steps: 100000,
                    outdoorMins: 1440,
                    sleepHours: 24,
                  }[h.source] ?? 100000,
                  Math.round(((v ?? 0) + h.step) * 100) / 100,
                )
              : done
                ? 0
                : 1;
        await enqueue(
          {
            kind: "log",
            key,
            data: {
              habitId: h.id,
              date,
              value,
              status: "logged",
              source: "manual",
            },
          },
          (p) => {
            p.snapshot.habitData.logs = p.snapshot.habitData.logs.filter(
              (l) => !(l.habitId === h.id && l.date === date),
            );
            p.snapshot.habitData.logs.push({
              habitId: h.id,
              date,
              value,
              updatedAt: new Date().toISOString(),
            });
          },
        );
        render();
      } catch (e) {
        $("status").textContent = e.message;
        button.disabled = false;
      }
    };
    row.append(button);
    list.append(row);
  }
  if (!list.children.length)
    list.textContent =
      "A planned rest day. Your next habits are ready when you are.";
}
async function enqueue(fields, patch) {
  payload = await vault.update((p) => {
    const mutation = {
      ...fields,
      id: crypto.randomUUID(),
      expected:
        p.snapshot.records.find((r) => r.key === fields.key)?.revision ?? null,
    };
    patch(p);
    p.snapshot.records = p.snapshot.records.filter((r) => r.key !== fields.key);
    p.snapshot.records.push({
      key: fields.key,
      data: fields.data,
      revision: mutation.id,
    });
    p.queue.push({ mutation });
    return p;
  });
}
$("unlock-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    payload = await vault.unlock($("pass").value);
    $("pass").value = "";
    render();
    questions();
  } catch (e) {
    $("error").textContent = e.message;
  }
};
function questions() {
  const period = $("period").value,
    prefs = payload.snapshot.records.find((r) => r.key === "preferences")?.data;
  const ids =
    prefs?.[period] ??
    (period === "morning"
      ? ["mood", "energy", "stress", "sleepHours", "sleepQuality"]
      : [
          "mood",
          "energy",
          "stress",
          "lifted",
          "cardio",
          "water",
          "alcohol",
          "outdoor",
        ]);
  const names = {
    mood: "Mood",
    energy: "Energy",
    stress: "Stress",
    sleepHours: "Hours slept",
    sleepQuality: "Sleep quality",
    water: "Water",
    alcohol: "Alcohol",
    outdoor: "Minutes outside",
    lifted: "Lifted weights",
    cardio: "Cardio",
  };
  $("questions").replaceChildren();
  for (const id of ids) {
    const label = document.createElement("label");
    label.textContent = names[id];
    const input = document.createElement("select");
    input.id = "q-" + id;
    input.setAttribute("aria-label", names[id]);
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Unanswered";
    input.append(blank);
    let values = ["lifted", "cardio"].includes(id)
      ? [0, 1]
      : id === "sleepHours"
        ? Array.from({ length: 49 }, (_, i) => i / 2)
        : ["water", "alcohol"].includes(id)
          ? Array.from({ length: 41 }, (_, i) => i)
          : id === "outdoor"
            ? Array.from({ length: 25 }, (_, i) => i * 10)
            : [1, 2, 3, 4, 5];
    for (const v of values) {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = ["lifted", "cardio"].includes(id)
        ? v
          ? "Yes"
          : "No"
        : String(v);
      input.append(o);
    }
    label.append(input);
    $("questions").append(label);
  }
}
$("period").onchange = questions;
$("checkin-form").onsubmit = async (e) => {
  e.preventDefault();
  const period = $("period").value,
    date = today(),
    existing = payload.snapshot.entries.find(
      (e) => e.date === date && e.period === period,
    ),
    data = structuredClone(existing?.data ?? {});
  let answered = false;
  for (const input of $("questions").querySelectorAll("select")) {
    if (input.value === "") continue;
    answered = true;
    const id = input.id.slice(2),
      v = Number(input.value),
      section = ["mood", "energy", "stress"].includes(id)
        ? "me"
        : ["sleepHours", "sleepQuality"].includes(id)
          ? "sleep"
          : ["lifted", "cardio"].includes(id)
            ? "training"
            : "habits";
    const name =
      { sleepHours: "hours", sleepQuality: "quality", outdoor: "outdoorMins" }[
        id
      ] ?? id;
    data[section] ??= {};
    data[section][name] = section === "training" ? !!v : v;
  }
  if (!answered) {
    $("status").textContent = "Add at least one answer.";
    return;
  }
  try {
    await enqueue(
      {
        kind: "entry",
        key: `entry:${date}:${period}`,
        data: { date, period, data },
      },
      (p) => {
        p.snapshot.entries = p.snapshot.entries.filter(
          (e) => !(e.date === date && e.period === period),
        );
        p.snapshot.entries.push({
          date,
          period,
          data,
          updatedAt: new Date().toISOString(),
        });
      },
    );
    render();
    questions();
  } catch (e) {
    $("status").textContent = e.message;
  }
};
$("sync").onclick = async () => {
  if (!navigator.onLine) {
    $("status").textContent = "Reconnect to sync. Your records are kept.";
    return;
  }
  $("sync").disabled = true;
  try {
    await navigator.locks.request("myday-sync", async () => {
      payload = await vault.read();
      while (payload.queue.length) {
        const item = payload.queue[0];
        const r = await fetch("/api/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.mutation),
        });
        if (!r.ok) {
          if (r.status === 401) {
            window.location.replace(new URL("/login", location.origin).href);
            return;
          }
          throw new Error(
            "A change needs review. Open the online app and unlock device storage to compare versions.",
          );
        }
        payload = await vault.update((p) => ({
          ...p,
          queue: p.queue.filter((x) => x.mutation.id !== item.mutation.id),
        }));
      }
      window.location.replace(new URL("/", location.origin).href);
    });
  } catch (e) {
    $("status").textContent = e.message;
  } finally {
    $("sync").disabled = false;
  }
};
$("lock").onclick = () => {
  vault.lock();
  payload = null;
  window.location.reload();
};
window.addEventListener("online", () => {
  if (payload) render();
});
