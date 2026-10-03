import { HistoryList } from "@/components/history/HistoryList";

export const metadata = { title: "History · My Day" };

export default function HistoryPage() {
  return (
    <>
      <header className="px-4 pb-4 pt-[max(env(safe-area-inset-top),1.5rem)]">
        <h1 className="font-display text-[34px] font-semibold leading-none">History</h1>
        <p className="mt-1.5 text-ink-2">Tap a day to fill in or edit a check-in.</p>
      </header>
      <HistoryList />
    </>
  );
}
