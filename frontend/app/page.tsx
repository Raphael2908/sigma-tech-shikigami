"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import type { Payload } from "@/lib/api";
import { fetchPayload } from "@/lib/api";

const fallbackData: Payload = {
  generated_at: new Date().toISOString(),
  client_name: "Atlas Restructuring Pte Ltd",
  workflow_name: "Withdrawal from Being Approved Liquidators",
  breadcrumb_name: "Atlas Restructuring",
  canary_status: "changed",
  stats: [
    ["Tracked fields", "5", ""],
    ["Review required", "2", "warn"],
    ["Missing", "1", "warn"],
    ["High confidence", "2", "ok"],
  ],
  table: [
    [
      "Atlas Restructuring Pte Ltd",
      "Withdrawal from Being Approved Liquidators",
      new Date().toLocaleString("en-SG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      "2 changes", "warn", "graph refresh",
    ],
  ],
  changes: [],
  uploads: [],
  groups: [],
  actions: [],
  fill: [],
  summary: { changes: 2, rebuilds: 1, simulated_fields: 5, real_submissions: 0, completion_ratio: 0.4 },
};

export default function DashboardPage() {
  const [data, setData] = useState<Payload>(fallbackData);
  const router = useRouter();

  useEffect(() => {
    fetchPayload().then((p) => { if (p) setData(p); });
  }, []);

  return (
    <div className="grid grid-cols-[248px_1fr] h-full">
      <Sidebar />
      <main className="flex flex-col min-w-0">
        <div className="flex justify-between items-center px-6 py-4 bg-white border-b border-[var(--line)]">
          <div className="text-[13px] text-[var(--muted)]">Dashboard</div>
          <div className="text-xs text-[var(--muted)] border border-[var(--line)] px-3 py-2 rounded-full bg-white">
            {new Date().toLocaleString("en-SG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div className="p-[22px] overflow-auto">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3.5 mb-[18px]">
            {data.stats.map(([label, value, tone]) => (
              <div key={label} className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-[#8b8b8b] mb-2">{label}</div>
                <div className={`text-[34px] font-serif ${tone === "warn" ? "text-[var(--warn)]" : tone === "ok" ? "text-[var(--ok)]" : ""}`} style={{ fontFamily: "Georgia, serif" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Workflows Table */}
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="text-[30px] font-serif" style={{ fontFamily: "Georgia, serif" }}>Monitored Workflows</div>
              <div className="text-[13px] text-[var(--muted)]">View all</div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Client", "Workflow", "Last Run", "Status", "Alerts"].map((h) => (
                    <th key={h} className="px-2.5 py-3 border-b border-[#ede7da] text-left font-mono text-[10px] font-medium tracking-wider uppercase text-[#8d8d8d]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.table.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => router.push("/client")}
                    className="cursor-pointer hover:bg-[var(--accent-soft)]"
                  >
                    <td className="px-2.5 py-3 text-[13px] border-b border-[#ede7da]">{row[0]}</td>
                    <td className="px-2.5 py-3 text-[13px] border-b border-[#ede7da]">{row[1]}</td>
                    <td className="px-2.5 py-3 text-[13px] border-b border-[#ede7da]">{row[2]}</td>
                    <td className="px-2.5 py-3 text-[13px] border-b border-[#ede7da]">
                      <span className={`inline-block px-2 py-[3px] rounded-full font-mono text-[10px] font-medium ${
                        row[4] === "warn" ? "bg-[var(--warn-soft)] text-[var(--warn)]" : "bg-[var(--ok-soft)] text-[var(--ok)]"
                      }`}>
                        {row[3]}
                      </span>
                    </td>
                    <td className="px-2.5 py-3 text-[13px] border-b border-[#ede7da]">{row[5]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
