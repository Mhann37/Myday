import { BottomNav } from "@/components/BottomNav";
import { SyncStatus } from "@/components/SyncStatus";
import { NetworkStatus } from "@/components/NetworkStatus";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:pl-60">
      <a href="#main-content" className="skip-link primary-button">
        Skip to content
      </a>
      <main
        id="main-content"
        className="mx-auto max-w-xl pb-28 lg:max-w-6xl lg:px-8 lg:pb-12 lg:pt-4"
      >
        <NetworkStatus />
        <SyncStatus />
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
