"use client";

import {
  CalendarDays,
  Leaf,
  Settings,
  ShieldCheck,
  Sparkles,
  Sprout,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

const ITEMS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/habits", label: "Habits", icon: Sprout },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface/80 px-5 py-8 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-on-accent">
            <Leaf size={22} />
          </span>
          <span className="font-display text-2xl font-semibold">
            My Day
            <span className="mt-0.5 block font-sans text-[10px] font-medium tracking-wider text-muted">
              A LITTLE BETTER, EVERY DAY
            </span>
          </span>
        </Link>
        <nav aria-label="Desktop main" className="mt-12 space-y-2">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-semibold",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-ink-2 hover:bg-surface-2",
                )}
              >
                <Icon size={19} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-line p-4">
          <Sprout size={23} className="mb-3 text-accent" />
          <p className="font-display text-lg leading-snug">
            Small steps.
            <br />
            Better days.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Build the habits that help you feel and perform at your best.
          </p>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck size={13} /> Your private space
        </p>
      </aside>
      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors",
                    active ? "text-ink" : "text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-14 place-items-center rounded-full transition-colors",
                      active && "bg-accent-soft text-accent",
                    )}
                  >
                    <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
