import { HabitTracker } from "@/components/habits/HabitTracker";
import { dateSchema } from "@/lib/schema";

export const metadata = { title: "Habits · My Day" };
export default async function HabitsPage({
  searchParams,
}: PageProps<"/habits">) {
  const { date } = await searchParams;
  const initialDate =
    typeof date === "string" && dateSchema.safeParse(date).success
      ? date
      : undefined;
  return (
    <div className="px-4">
      <header className="pb-6 pt-7">
        <p className="eyebrow">CONSISTENCY OVER PERFECTION</p>
        <h1 className="font-display mt-2 text-4xl font-semibold">
          Build your rhythm.
        </h1>
        <p className="mt-2 text-ink-2">
          A little better, a little more often. Make the plan fit your life.
        </p>
      </header>
      <HabitTracker initialDate={initialDate} />
    </div>
  );
}
