import type { DayRecord, Driver } from "./analytics";
import { habitValue, type HabitData } from "./habits";

/** Quick logs contribute measurements without pretending a diary was completed. */
export function enrichDays(
  days: DayRecord[],
  data: HabitData | null,
): DayRecord[] {
  if (!data) return days;
  const map = new Map<string, DayRecord>(
    days.map((d) => [d.date, { ...d, habitTargets: {} }]),
  );
  const habits = new Map(data.habits.map((h) => [h.id, h]));
  for (const log of [...data.logs].sort((a, b) =>
    a.updatedAt.localeCompare(b.updatedAt),
  )) {
    const habit = habits.get(log.habitId);
    if (!habit) continue;
    const day = map.get(log.date) ?? {
      date: log.date,
      hasMorning: false,
      hasNight: false,
      kids: {},
      injuryParts: [],
      habitTargets: {},
    };
    if (habit.source !== "custom") {
      const source = habit.source;
      if (
        source === "exercised" ||
        source === "lifted" ||
        source === "wifeTime"
      )
        day[source] = log.value >= 1;
      else day[source] = log.value;
    }
    map.set(day.date, day);
  }
  const result = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of result) {
    day.habitTargets ??= {};
    for (const habit of data.habits) {
      const value =
        day.date < habit.createdDate
          ? undefined
          : habitValue(habit, day.date, data.logs, days);
      day.habitTargets[habit.id] =
        value === undefined ? undefined : value >= habit.target;
    }
    if (day.lifted === true || day.cardio === true) day.exercised = true;
  }
  return result;
}

export function habitDrivers(data: HabitData | null): Driver[] {
  return (
    data?.habits
      .filter((h) => h.source === "custom")
      .map((h) => ({
        id: `habit:${h.id}`,
        phrase: `you met your “${h.name}” target`,
        test: (day: DayRecord) => day.habitTargets?.[h.id],
      })) ?? []
  );
}
