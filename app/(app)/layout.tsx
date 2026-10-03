import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-28">
      {children}
      <BottomNav />
    </div>
  );
}
