import { Insights } from "@/components/insights/Insights";

export const metadata = { title: "Insights · My Day" };

export default function InsightsPage() {
  return (
    <>
      <header className="px-4 pb-4 pt-[max(env(safe-area-inset-top),1.5rem)]">
        <h1 className="font-display text-[34px] font-semibold leading-none">Insights</h1>
        <p className="mt-1.5 text-ink-2">What your diary says, in plain English.</p>
      </header>
      <Insights />
    </>
  );
}
