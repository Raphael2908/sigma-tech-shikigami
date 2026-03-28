"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const path = usePathname();
  const isDashboard = path === "/";
  const isClient = path.startsWith("/client");

  return (
    <aside className="w-[248px] bg-white border-r border-[var(--line)] p-[18px_14px] flex flex-col gap-[18px] shrink-0">
      <div className="text-[30px] font-serif px-2 pb-4 border-b border-[var(--line)]" style={{ fontFamily: "Georgia, serif" }}>
        Regulator.
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="font-mono text-[10px] font-medium tracking-[.14em] uppercase text-[#9a9a9a] px-2 pb-1.5">
          Overview
        </div>
        <Link
          href="/"
          className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-colors ${
            isDashboard ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[#4b4b4b] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          }`}
        >
          Dashboard
          <span className="font-mono text-[10px] font-medium px-[7px] py-[2px] rounded-full bg-[var(--warn)] text-white">1</span>
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="font-mono text-[10px] font-medium tracking-[.14em] uppercase text-[#9a9a9a] px-2 pb-1.5">
          Clients
        </div>
        <Link
          href="/client"
          className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-colors ${
            isClient ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[#4b4b4b] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          }`}
        >
          Atlas Restructuring
          <span className="font-mono text-[10px] font-medium px-[7px] py-[2px] rounded-full bg-[var(--warn)] text-white">2</span>
        </Link>
        <button className="flex items-center px-3 py-2.5 rounded-[10px] text-[13px] font-medium text-[#4b4b4b] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] text-left">
          Liquidation Desk
        </button>
        <button className="flex items-center px-3 py-2.5 rounded-[10px] text-[13px] font-medium text-[#4b4b4b] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] text-left">
          Regulatory Ops
        </button>
      </div>

      <div className="mt-auto border-t border-[var(--line)] pt-3.5 px-2 text-xs text-[var(--muted)] leading-relaxed">
        Rachel Tan<br />Senior QI
      </div>
    </aside>
  );
}
