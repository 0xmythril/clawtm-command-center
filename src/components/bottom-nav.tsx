"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlayCircle, Radio, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "Home", dotKey: "home" as const },
  { href: "/actions", icon: PlayCircle, label: "Actions", dotKey: "actions" as const },
  { href: "/contacts", icon: Radio, label: "Contacts", dotKey: "contacts" as const },
  { href: "/memory", icon: Brain, label: "Memory", dotKey: "memory" as const },
];

type DotKeys = Record<string, boolean>;

export function BottomNav() {
  const pathname = usePathname();
  const [dots, setDots] = useState<DotKeys>({});

  useEffect(() => {
    async function checkNotifications() {
      try {
        const proposalsRes = await fetch("/api/workspace?file=PROPOSALS.md").catch(() => null);

        const newDots: DotKeys = {};

        if (proposalsRes) {
          const data = await proposalsRes.json();
          if (data.content?.trim()) {
            newDots.home = true;
          }
        }

        // Check for pending pairing requests or device approvals
        try {
          const contactsRes = await fetch("/api/contacts?summary=true");
          if (contactsRes.ok) {
            const summary = await contactsRes.json();
            if ((summary.pendingPairingCount ?? 0) > 0 || (summary.pendingDevicesCount ?? 0) > 0) {
              newDots.contacts = true;
            }
          }
        } catch {
          // ignore
        }

        setDots(newDots);
      } catch {
        // ignore
      }
    }

    checkNotifications();
    const interval = setInterval(checkNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-800 z-40">
      <div className="max-w-2xl mx-auto flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const hasDot = dots[item.dotKey] && !isActive;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full transition-colors btn-press relative",
                isActive
                  ? "text-emerald-500"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <div className="relative">
                <item.icon className="w-6 h-6" strokeWidth={1.5} />
                {hasDot && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-zinc-900" />
                )}
              </div>
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
