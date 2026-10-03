import { Settings } from "@/components/settings/Settings";

export const metadata = { title: "Settings · My Day" };

export default function SettingsPage() {
  return (
    <>
      <header className="px-4 pb-4 pt-[max(env(safe-area-inset-top),1.5rem)]">
        <h1 className="font-display text-[34px] font-semibold leading-none">Settings</h1>
      </header>
      <Settings />
    </>
  );
}
