"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import type { Payload } from "@/lib/api";
import { fetchPayload } from "@/lib/api";

const fallback: Payload = {
  generated_at: "", client_name: "Atlas Restructuring Pte Ltd",
  workflow_name: "Withdrawal from Being Approved Liquidators",
  breadcrumb_name: "Atlas Restructuring", canary_status: "changed",
  stats: [["Tracked fields","5",""],["Review required","2","warn"],["Missing","1","warn"],["High confidence","2","ok"]],
  table: [],
  changes: [
    { kind: "warn", title: "Eligibility wording changed on ACRA guidance page", desc: "Semantic diff marked withdrawal eligibility language as material.", meta: "Node diff | material" },
    { kind: "warn", title: "Supporting document list expanded", desc: "Current extract includes an additional document expectation.", meta: "Version history delta" },
    { kind: "info", title: "Top-level navigation drift detected", desc: "Canary noticed site-structure drift.", meta: "Canary status | changed" },
  ],
  uploads: [
    ["acra_withdrawal_form.pdf", "Simulated preprocess", "OpenAI derives structured fields and TinyFish goals"],
    ["supporting_statement.pdf", "Simulated preprocess", "Narrative grounds normalized into field context"],
    ["regulatory_correspondence.pdf", "Simulated preprocess", "References linked to graph nodes"],
  ],
  groups: [
    ["Withdrawal request", [["Lodgement description", "Pending extraction", "review"], ["Supporting documents", "Identity document, signed statement", "ok"]]],
    ["Supporting materials", [["Required PDF form", "Pending extraction", "missing"]]],
    ["Regulatory checks", [["Eligibility criteria", "Updated wording", "review"], ["Filing fees", "No filing fee", "ok"]]],
  ],
  actions: [
    ["warnbox", "Action", "PDF form: Requires analyst confirmation.", "Resolved - evidence attached"],
    ["notebox", "Note", "Eligibility criteria: Updated wording requires review.", "Reviewed - accept updated wording"],
  ],
  fill: [
    ["Lodgement description", "Withdrawal from Being Approved Liquidators"],
    ["Required PDF form", "CSP_Update form"],
    ["Supporting documents", "Identity document, signed statement"],
    ["Eligibility criteria", "Must have no outstanding appointments"],
    ["Filing fees", "No filing fee"],
  ],
  summary: { changes: 2, rebuilds: 1, simulated_fields: 5, real_submissions: 0, completion_ratio: 0.4 },
};

function ChangeFeed({ changes }: { changes: Payload["changes"] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {changes.map((item) => (
        <div key={item.title} className="flex gap-3 p-3 border border-[#ece5d8] rounded-xl bg-white">
          <div className={`w-6 h-6 rounded-lg grid place-items-center font-mono text-[11px] font-bold shrink-0 ${
            item.kind === "warn" ? "bg-[var(--warn-soft)] text-[var(--warn)]"
            : item.kind === "ok" ? "bg-[var(--ok-soft)] text-[var(--ok)]"
            : "bg-[var(--accent-soft)] text-[var(--accent)]"
          }`}>
            {item.kind === "warn" ? "!" : item.kind === "ok" ? "OK" : "i"}
          </div>
          <div>
            <div className="text-sm font-semibold">{item.title}</div>
            <div className="text-[13px] text-[var(--muted)]">{item.desc}</div>
            <div className="mt-1 font-mono text-[10px] font-medium text-[#8d8d8d]">{item.meta}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UploadStep({ uploads, uploaded, onUpload }: { uploads: Payload["uploads"]; uploaded: boolean; onUpload: () => void }) {
  return (
    <>
      {!uploaded && (
        <div onClick={onUpload} className="border-2 border-dashed border-[var(--line)] p-[34px_20px] rounded-2xl text-center bg-white cursor-pointer hover:border-[var(--accent)]">
          <h3 className="text-[30px] font-serif mb-1.5" style={{ fontFamily: "Georgia, serif" }}>Upload the ACRA withdrawal form pack</h3>
          <p className="text-[13px] text-[var(--muted)]">Simulated demo: OpenAI preprocesses files into structured fields and TinyFish goals.</p>
        </div>
      )}
      <div className="flex flex-col gap-2.5 mt-3.5">
        {uploaded && uploads.map((file) => (
          <div key={file[0]} className="flex justify-between items-center p-[12px_14px] border border-[#ece5d8] rounded-xl bg-white">
            <div>
              <strong className="text-sm">{file[0]}</strong>
              <div className="text-[13px] text-[var(--muted)]">{file[1]}</div>
            </div>
            <div className="text-[13px] text-[var(--muted)]">{file[2]}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function ReviewStep({ data, resolved, setResolved, onContinue }: {
  data: Payload; resolved: number[]; setResolved: (r: number[]) => void; onContinue: () => void;
}) {
  const ready = resolved.length === data.actions.length;
  return (
    <>
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl overflow-hidden">
        <div className="flex justify-between p-[14px_16px] bg-[var(--panel-2)] border-b border-[var(--line)]">
          <span className="text-sm font-medium">Pre-populated Draft</span>
          <span className="text-sm text-[var(--muted)]">{data.fill.length} fields extracted</span>
        </div>
        <div>
          {data.groups.map(([groupName, fields]) => (
            <div key={groupName} className="py-3.5">
              <div className="px-4 pb-2 font-mono text-[10px] font-medium tracking-[.14em] uppercase text-[#8e8e8e]">{groupName}</div>
              {fields.map(([name, value, status]) => (
                <div key={name} className="grid grid-cols-[180px_1fr_20px] gap-2.5 px-4 py-2.5 border-t border-[#f0eadf] items-center first:border-t-0">
                  <div className="text-[13px] text-[#666]">{name}</div>
                  <div className={`px-2.5 py-2 border rounded-lg text-[13px] ${
                    status !== "ok" ? "bg-[var(--warn-soft)] border-[#e2c7be]" : "bg-[#faf7ef] border-[#e8e1d4]"
                  }`}>{value}</div>
                  <div className={`w-[18px] h-[18px] rounded-full grid place-items-center font-mono text-[10px] font-bold ${
                    status === "ok" ? "bg-[var(--ok-soft)] text-[var(--ok)]"
                    : status === "review" ? "bg-[var(--review-soft)] text-[var(--review)]"
                    : "bg-[var(--warn-soft)] text-[var(--warn)]"
                  }`}>
                    {status === "ok" ? "OK" : status === "review" ? "?" : "!"}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {data.actions.map((action, i) =>
            resolved.includes(i) ? null : (
              <div key={i} className={`mx-4 mb-3 p-[12px_14px] rounded-[10px] text-[13px] ${
                action[0] === "warnbox" ? "bg-[var(--warn-soft)]" : "bg-[var(--review-soft)]"
              }`}>
                <strong>{action[1]}:</strong> {action[2]}<br />
                <span className="inline-block mt-1.5 text-[var(--accent)] font-semibold cursor-pointer underline"
                  onClick={() => setResolved([...resolved, i])}>
                  {action[3]}
                </span>
              </div>
            )
          )}
        </div>
      </div>
      <div className="flex justify-between items-center gap-3 mt-3 text-[13px] text-[var(--muted)]">
        <span>High confidence fields flow to the simulated portal. Review-required fields stay gated.</span>
        <button disabled={!ready} onClick={onContinue}
          className="shrink-0 px-4 py-[11px] rounded-[10px] font-semibold text-[13px] bg-[var(--accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed">
          Tinyfish simulated fill
        </button>
      </div>
    </>
  );
}

function PortalStep({ fill, filledValues, logs }: { fill: Payload["fill"]; filledValues: string[]; logs: string[] }) {
  return (
    <div className="grid grid-cols-[1fr_300px] gap-3.5">
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#f1f1f1] border-b border-[#dadada]">
          <span className="w-[9px] h-[9px] rounded-full bg-[#ff5f57]" />
          <span className="w-[9px] h-[9px] rounded-full bg-[#febc2e]" />
          <span className="w-[9px] h-[9px] rounded-full bg-[#28c840]" />
          <div className="flex-1 bg-white border border-[#d8d8d8] rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-medium text-[#666]">
            www.acra.gov.sg/approved-liquidators/withdrawal
          </div>
        </div>
        <div className="p-[18px]">
          <h3 className="text-lg text-[#003d7c] font-semibold mb-1">Withdrawal from Approved Liquidators</h3>
          <p className="text-xs text-[#666] mb-3.5">Simulation only. Values projected from reviewed extraction output.</p>
          {fill.map(([label, value], i) => (
            <div key={label} className="grid grid-cols-[190px_1fr] gap-2.5 py-[9px] border-b border-[#ececec] last:border-b-0">
              <div className="text-[13px] text-[var(--muted)]">{label}</div>
              <div className={`min-h-[30px] border rounded-lg px-2.5 py-[7px] text-[13px] ${
                filledValues[i] === "" ? "bg-[#fafafa] border-[#d7d7d7]"
                : filledValues[i] === value ? "bg-[rgba(43,122,97,0.06)] border-[var(--ok)]"
                : "bg-[rgba(14,165,233,0.08)] border-[#0ea5e9]"
              }`}>
                {filledValues[i]}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl flex flex-col">
        <div className="px-4 py-3.5 border-b border-[var(--line)] bg-[var(--panel-2)] font-mono text-[11px] font-medium tracking-wider uppercase text-[#7b7b7b]">
          Tinyfish Agent
        </div>
        <div className="px-4 py-3.5 flex flex-col gap-2.5 min-h-[420px]">
          {logs.map((line, i) => (
            <div key={i} className="pb-2.5 border-b border-[#eee7db] text-[13px] text-[#575757]"
              dangerouslySetInnerHTML={{ __html: line }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DoneStep({ summary }: { summary: Payload["summary"] }) {
  return (
    <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl text-center p-[34px_24px]">
      <h3 className="text-[36px] font-serif mb-2" style={{ fontFamily: "Georgia, serif" }}>
        Review package prepared.
      </h3>
      <p className="max-w-[680px] mx-auto mb-[18px] text-[var(--muted)]">
        The withdrawal workflow has been preprocessed, traced against ACRA guidance, checked against version history, and projected into a simulated fill experience.
      </p>
      <div className="flex justify-center gap-7 pt-[18px] border-t border-[var(--line)]">
        {[
          [summary.changes, "changes surfaced"],
          [summary.rebuilds, "branch rebuilt"],
          [summary.simulated_fields, "fields simulated"],
          [summary.real_submissions, "real submissions"],
        ].map(([num, label]) => (
          <div key={label as string}>
            <div className="text-[32px] font-serif text-[var(--ok)]" style={{ fontFamily: "Georgia, serif" }}>{num}</div>
            <div className="text-[13px] text-[var(--muted)]">{label as string}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClientPage() {
  const [data, setData] = useState<Payload>(fallback);
  const [step, setStep] = useState(1);
  const [uploaded, setUploaded] = useState(false);
  const [resolved, setResolved] = useState<number[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [filledValues, setFilledValues] = useState<string[]>([]);

  useEffect(() => {
    fetchPayload().then((p) => {
      if (p) {
        setData(p);
        setFilledValues(Array(p.fill.length).fill(""));
      }
    });
  }, []);

  useEffect(() => {
    if (filledValues.length === 0 && data.fill.length > 0) {
      setFilledValues(Array(data.fill.length).fill(""));
    }
  }, [data.fill.length, filledValues.length]);

  const runFill = useCallback(() => {
    if (logs.length) return;
    setLogs(["<strong>Tinyfish simulation initialized.</strong> Using reviewed fields and refreshed graph nodes."]);
    setTimeout(() => setLogs((p) => [...p, "ACRA portal shell loaded. Beginning projected fill."]), 600);
    data.fill.forEach(([label, value], idx) => {
      setTimeout(() => {
        setLogs((p) => [...p, `Filling <strong>${label}</strong> with <strong>${value}</strong>.`]);
        let n = 0;
        const timer = setInterval(() => {
          n += 2;
          setFilledValues((prev) => {
            const next = [...prev];
            next[idx] = value.slice(0, n);
            return next;
          });
          if (n >= value.length) clearInterval(timer);
        }, 28);
      }, 1100 + idx * 700);
    });
    setTimeout(() => {
      setLogs((p) => [...p, "<strong>Complete.</strong> Review package ready. No real submission."]);
      setTimeout(() => setStep(5), 800);
    }, 1100 + data.fill.length * 700 + 300);
  }, [logs.length, data.fill]);

  useEffect(() => {
    if (step === 4) runFill();
  }, [step, runFill]);

  const stepClass = (n: number) =>
    `py-3 text-center text-xs border-r border-[var(--line)] last:border-r-0 ${
      n < step ? "bg-[var(--ok-soft)] text-[var(--ok)] font-semibold"
      : n === step ? "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
      : "text-[#909090]"
    }`;

  return (
    <div className="grid grid-cols-[248px_1fr] h-full">
      <Sidebar />
      <main className="flex flex-col min-w-0">
        <div className="flex justify-between items-center px-6 py-4 bg-white border-b border-[var(--line)]">
          <div className="text-[13px] text-[var(--muted)]">Dashboard / {data.breadcrumb_name}</div>
          <div className="text-xs text-[var(--muted)] border border-[var(--line)] px-3 py-2 rounded-full bg-white">
            {new Date().toLocaleString("en-SG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div className="p-[22px] overflow-auto">
          {/* Hero */}
          <div className="flex justify-between items-end mb-[18px] pb-3.5 border-b border-[var(--line)]">
            <div>
              <h2 className="text-[36px] font-serif" style={{ fontFamily: "Georgia, serif" }}>{data.client_name}</h2>
              <div className="text-[13px] text-[var(--muted)]">ACRA workflow &middot; {data.workflow_name}</div>
            </div>
            <div className="text-[13px] text-[var(--muted)] text-right">
              Last run: {new Date().toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" })}<br />
              Canary: {data.canary_status === "changed" ? "Maintenance watch" : "Stable"}
            </div>
          </div>

          {/* Stepper */}
          <div className="grid grid-cols-5 bg-white border border-[var(--line)] rounded-[14px] overflow-hidden mb-4">
            {["01 Upload", "02 Changes", "03 Review", "04 Simulate Fill", "05 Done"].map((label, i) => (
              <div key={label} className={stepClass(i + 1)}>{label}</div>
            ))}
          </div>

          {/* Steps */}
          {step === 1 && (
            <>
              <UploadStep uploads={data.uploads} uploaded={uploaded} onUpload={() => setUploaded(true)} />
              {uploaded && (
                <div className="flex justify-between items-center gap-3 mt-3 text-[13px] text-[var(--muted)]">
                  <span>Structured fields and goals prepared for graph trace.</span>
                  <button onClick={() => setStep(2)} className="px-4 py-[11px] rounded-[10px] font-semibold text-[13px] bg-[#171717] text-white">
                    Continue to Changes
                  </button>
                </div>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <ChangeFeed changes={data.changes} />
              <div className="flex justify-between items-center gap-3 mt-3 text-[13px] text-[var(--muted)]">
                <span>Pipeline: compare hashes, run semantic diff, refresh changed graph branches</span>
                <button onClick={() => setStep(3)} className="px-4 py-[11px] rounded-[10px] font-semibold text-[13px] bg-[#171717] text-white">
                  Continue to Review
                </button>
              </div>
            </>
          )}
          {step === 3 && <ReviewStep data={data} resolved={resolved} setResolved={setResolved} onContinue={() => setStep(4)} />}
          {step === 4 && <PortalStep fill={data.fill} filledValues={filledValues} logs={logs} />}
          {step === 5 && <DoneStep summary={data.summary} />}
        </div>
      </main>
    </div>
  );
}
