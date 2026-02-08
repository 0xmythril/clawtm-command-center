"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Puzzle, PlayCircle, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/actions", icon: PlayCircle, label: "Actions" },
  { href: "/skills", icon: Puzzle, label: "Skills" },
  { href: "/memory", icon: Brain, label: "Memory" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-800 z-40">
      <div className="max-w-2xl mx-auto flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full transition-colors btn-press",
                isActive
                  ? "text-orange-500"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <item.icon className="w-6 h-6" strokeWidth={1.5} />
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
