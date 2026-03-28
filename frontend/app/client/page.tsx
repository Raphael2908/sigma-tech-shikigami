"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import type { Payload, ChangeItem, ReasoningItem } from "@/lib/api";
import { uploadFiles, streamBrowse, streamConsolidate } from "@/lib/api";

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
  uploads: [],
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

/* ── Step 01: Upload ─────────────────────────────────────────── */

function UploadStep({ onUploadComplete }: {
  onUploadComplete: (uploads: [string, string, string][], fields: any[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<[string, string, string][]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFiles(fileList);
      setUploadedFiles(result.uploads);
      onUploadComplete(result.uploads, result.extracted_fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploadedFiles.length === 0 && (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
          className={`border-2 border-dashed border-[var(--line)] p-[34px_20px] rounded-2xl text-center bg-white cursor-pointer hover:border-[var(--accent)] transition-colors ${uploading ? "opacity-60 pointer-events-none" : ""}`}
        >
          {uploading ? (
            <>
              <h3 className="text-[30px] font-serif mb-1.5" style={{ fontFamily: "Georgia, serif" }}>Uploading...</h3>
              <p className="text-[13px] text-[var(--muted)]">Saving to GitHub and extracting fields with OpenAI.</p>
            </>
          ) : (
            <>
              <h3 className="text-[30px] font-serif mb-1.5" style={{ fontFamily: "Georgia, serif" }}>Upload your PDF documents</h3>
              <p className="text-[13px] text-[var(--muted)]">Drop PDF files here or click to browse. Files will be uploaded to GitHub and processed by OpenAI for field extraction.</p>
            </>
          )}
        </div>
      )}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      <div className="flex flex-col gap-2.5 mt-3.5">
        {uploadedFiles.map((file) => (
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

/* ── Step 02: Browsing + Changes ─────────────────────────────── */

type NodeTrace = {
  url: string;
  status: "active" | "done" | "waiting" | "error";
  messages: string[];
};

function BrowsingStep({ onComplete }: {
  onComplete: (changes: ChangeItem[], changeUploads: Record<number, { filename: string; fields: any[] }>) => void;
}) {
  const [nodeTraces, setNodeTraces] = useState<NodeTrace[]>([]);
  const [pipelineMessages, setPipelineMessages] = useState<string[]>([]);
  const [browseComplete, setBrowseComplete] = useState(false);
  const [detectedChanges, setDetectedChanges] = useState<ChangeItem[]>([]);
  const [changeUploads, setChangeUploads] = useState<Record<number, { filename: string; fields: any[] }>>({});
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const startedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pipelineMessages, nodeTraces]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    setPipelineMessages(["Connecting to backend..."]);

    streamBrowse(
      (evt) => {
        const msg = evt.message || "";
        const nodeUrl = evt.node_url;

        if (evt.step === "extract" && nodeUrl) {
          setNodeTraces((prev) => {
            const existing = prev.find((n) => n.url === nodeUrl);
            if (existing) {
              return prev.map((n) =>
                n.url === nodeUrl ? { ...n, messages: [...n.messages, msg] } : n
              );
            }
            return [
              ...prev.map((n) => n.status === "active" ? { ...n, status: "done" as const } : n),
              { url: nodeUrl, status: "active" as const, messages: [msg] },
            ];
          });
        } else {
          setPipelineMessages((p) => [...p, `[${evt.step}] ${msg}`]);
        }
      },
      () => {},
      (data) => {
        setDetectedChanges(data.changes);
        setBrowseComplete(true);
        setNodeTraces((prev) => prev.map((n) => ({ ...n, status: "done" as const })));
        setPipelineMessages((p) => [...p, `Extraction complete. ${data.extraction_count} nodes processed.`]);
      },
      (errMsg) => {
        setError(errMsg);
        setPipelineMessages((p) => [...p, `ERROR: ${errMsg}`]);
      },
    );
  }, []);

  const handleChangeUpload = async (changeIdx: number, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(changeIdx);
    try {
      const result = await uploadFiles(fileList);
      setChangeUploads((prev) => ({
        ...prev,
        [changeIdx]: { filename: result.uploads[0]?.[0] || "unknown", fields: result.extracted_fields },
      }));
    } catch (e) {
      console.error("Change upload failed:", e);
    } finally {
      setUploading(null);
    }
  };

  const allAddressed = detectedChanges.length === 0 || Object.keys(changeUploads).length >= detectedChanges.filter(c => c.kind === "warn").length;

  return (
    <>
      {/* Phase A: Live trace */}
      {!browseComplete && (
        <div className="grid grid-cols-[1fr_280px] gap-3.5">
          {/* Node trace panel */}
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-[var(--panel-2)] border-b border-[var(--line)]">
              <div className="w-2 h-2 rounded-full bg-[var(--ok)] animate-pulse" />
              <span className="font-mono text-[11px] font-medium tracking-wider uppercase text-[#7b7b7b]">TinyFish Trace</span>
              <span className="ml-auto text-[11px] text-[var(--muted)]">{nodeTraces.length} node{nodeTraces.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="p-4 min-h-[360px] max-h-[480px] overflow-y-auto flex flex-col gap-3">
              {nodeTraces.length === 0 && (
                <div className="text-[13px] text-[var(--muted)] animate-pulse">Initializing pipeline...</div>
              )}
              {nodeTraces.map((node) => (
                <div key={node.url} className={`p-3 rounded-xl border transition-all ${
                  node.status === "active"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : node.status === "done"
                    ? "border-[#ece5d8] bg-white"
                    : node.status === "error"
                    ? "border-[var(--warn)] bg-[var(--warn-soft)]"
                    : "border-[var(--line)] bg-[var(--panel)]"
                }`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      node.status === "active" ? "bg-[var(--accent)] animate-pulse"
                      : node.status === "done" ? "bg-[var(--ok)]"
                      : node.status === "error" ? "bg-[var(--warn)]"
                      : "bg-[#ccc]"
                    }`} />
                    <div className="font-mono text-[11px] text-[#555] truncate">{node.url}</div>
                  </div>
                  <div className="flex flex-col gap-1 ml-4">
                    {node.messages.map((msg, j) => (
                      <div key={j} className={`text-[12px] ${
                        j === node.messages.length - 1 && node.status === "active"
                          ? "text-[var(--accent)] font-medium"
                          : "text-[#888]"
                      }`}>
                        {msg}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Pipeline log sidebar */}
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl flex flex-col">
            <div className="px-4 py-3.5 border-b border-[var(--line)] bg-[var(--panel-2)] font-mono text-[11px] font-medium tracking-wider uppercase text-[#7b7b7b]">
              Pipeline Log
            </div>
            <div className="px-4 py-3.5 flex flex-col gap-2 min-h-[320px] max-h-[480px] overflow-y-auto">
              {pipelineMessages.map((line, i) => (
                <div key={i} className="pb-2 border-b border-[#eee7db] text-[11px] text-[#575757] font-mono">
                  {line}
                </div>
              ))}
              {pipelineMessages.length === 0 && (
                <div className="text-[12px] text-[var(--muted)] animate-pulse">Connecting...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-3 p-3 bg-[var(--warn-soft)] border border-[var(--warn)] rounded-xl text-sm text-[var(--warn)]">
          <strong>Connection error:</strong> {error}
        </div>
      )}

      {/* Phase B: Change response */}
      {browseComplete && (
        <div className="flex flex-col gap-2.5">
          {detectedChanges.length === 0 && (
            <div className="p-4 bg-[var(--ok-soft)] border border-[var(--ok)] rounded-xl text-sm">
              No changes detected. All extracted data is up to date.
            </div>
          )}
          {detectedChanges.map((change, i) => (
            <div key={i} className="p-3 border border-[#ece5d8] rounded-xl bg-white">
              <div className="flex gap-3">
                <div className={`w-6 h-6 rounded-lg grid place-items-center font-mono text-[11px] font-bold shrink-0 ${
                  change.kind === "warn" ? "bg-[var(--warn-soft)] text-[var(--warn)]"
                  : "bg-[var(--accent-soft)] text-[var(--accent)]"
                }`}>
                  {change.kind === "warn" ? "!" : "i"}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{change.title}</div>
                  <div className="text-[13px] text-[var(--muted)]">{change.desc}</div>
                  <div className="mt-1 font-mono text-[10px] font-medium text-[#8d8d8d]">{change.meta}</div>

                  {/* Upload revised doc for this change */}
                  {change.kind === "warn" && (
                    <div className="mt-2.5">
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        ref={(el) => { fileInputRefs.current[i] = el; }}
                        onChange={(e) => handleChangeUpload(i, e.target.files)}
                      />
                      {changeUploads[i] ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--ok-soft)] rounded-lg text-[12px]">
                          <span className="w-4 h-4 rounded-full bg-[var(--ok)] text-white grid place-items-center text-[10px] font-bold">OK</span>
                          <span className="font-medium">{changeUploads[i].filename}</span>
                          <span className="text-[var(--muted)]">— {changeUploads[i].fields.length} fields extracted</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileInputRefs.current[i]?.click()}
                          disabled={uploading === i}
                          className="px-3 py-2 rounded-lg text-[12px] font-medium border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
                        >
                          {uploading === i ? "Uploading..." : "Upload revised document"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center gap-3 mt-3 text-[13px] text-[var(--muted)]">
            <span>{allAddressed ? "All changes addressed." : "Upload revised documents for flagged changes."}</span>
            <button
              onClick={() => onComplete(detectedChanges, changeUploads)}
              className="px-4 py-[11px] rounded-[10px] font-semibold text-[13px] bg-[#171717] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue to Review
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Step 03: Consolidation ──────────────────────────────────── */

function ConsolidationStep({
  uploadedFields, changes, changeUploads, onComplete,
}: {
  uploadedFields: any[];
  changes: ChangeItem[];
  changeUploads: Record<number, { filename: string; fields: any[] }>;
  onComplete: (pdfUrl: string) => void;
}) {
  const [reasoningLog, setReasoningLog] = useState<ReasoningItem[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [consolidationDone, setConsolidationDone] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>("Starting consolidation...");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const body = {
      uploaded_files: [{ fields: uploadedFields }],
      changes,
      change_uploads: Object.values(changeUploads).map((cu) => ({ fields: cu.fields })),
    };

    streamConsolidate(
      body,
      (item) => setReasoningLog((p) => [...p, item]),
      (evt) => setProgressMsg(evt.message),
      (data) => {
        setPdfUrl(data.pdf_url);
        setConsolidationDone(true);
      },
    ).catch((e) => {
      console.error("Consolidation failed:", e);
      setProgressMsg("Consolidation failed. Using fallback data.");
      setConsolidationDone(true);
    });
  }, [uploadedFields, changes, changeUploads]);

  const confidenceColor = (c: string) => {
    if (c === "high") return "bg-[var(--ok-soft)] text-[var(--ok)]";
    if (c === "medium") return "bg-[var(--review-soft)] text-[var(--review)]";
    return "bg-[var(--warn-soft)] text-[var(--warn)]";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl overflow-hidden">
        <div className="flex justify-between p-[14px_16px] bg-[var(--panel-2)] border-b border-[var(--line)]">
          <span className="text-sm font-medium">OpenAI Consolidation</span>
          <span className="text-sm text-[var(--muted)]">{progressMsg}</span>
        </div>
        <div className="p-4 flex flex-col gap-3 min-h-[300px]">
          {reasoningLog.map((item, i) => (
            <div key={i} className="p-3 border border-[#ece5d8] rounded-xl bg-white">
              <div className="flex justify-between items-start mb-1.5">
                <div className="text-sm font-semibold">{item.field}</div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${confidenceColor(item.confidence)}`}>
                  {item.confidence}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-1.5 text-[12px]">
                <span className="text-[var(--muted)]">Source:</span>
                <span className="font-mono">{item.source_doc}</span>
                <span className="text-[var(--muted)]">Value:</span>
                <span className="font-medium">{item.value}</span>
                <span className="text-[var(--muted)]">Reason:</span>
                <span className="text-[#575757]">{item.reason}</span>
              </div>
            </div>
          ))}
          {reasoningLog.length === 0 && !consolidationDone && (
            <div className="text-[13px] text-[var(--muted)] animate-pulse">OpenAI is analyzing extracted fields...</div>
          )}
        </div>
      </div>

      {consolidationDone && (
        <div className="flex justify-between items-center gap-3 text-[13px] text-[var(--muted)]">
          <div className="flex items-center gap-3">
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg text-[12px] font-medium border border-[var(--ok)] bg-[var(--ok-soft)] text-[var(--ok)] hover:opacity-80">
                Download filled PDF
              </a>
            )}
            <span>{reasoningLog.length} fields consolidated</span>
          </div>
          <button onClick={() => onComplete(pdfUrl || "")}
            className="px-4 py-[11px] rounded-[10px] font-semibold text-[13px] bg-[#171717] text-white">
            Continue to Simulate Fill
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Step 04: Portal Sim (unchanged) ─────────────────────────── */

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

/* ── Step 05: Done (unchanged) ───────────────────────────────── */

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

/* ── Main Page ───────────────────────────────────────────────── */

export default function ClientPage() {
  const [data, setData] = useState<Payload>(fallback);
  const [step, setStep] = useState(1);
  const [uploaded, setUploaded] = useState(false);
  const [uploadedFields, setUploadedFields] = useState<any[]>([]);
  const [detectedChanges, setDetectedChanges] = useState<ChangeItem[]>([]);
  const [changeUploads, setChangeUploads] = useState<Record<number, { filename: string; fields: any[] }>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [filledValues, setFilledValues] = useState<string[]>(() => Array(fallback.fill.length).fill(""));

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
              <UploadStep onUploadComplete={(uploads, fields) => {
                setUploaded(true);
                setUploadedFields(fields);
              }} />
              {uploaded && (
                <div className="flex justify-between items-center gap-3 mt-3 text-[13px] text-[var(--muted)]">
                  <span>Files uploaded. {uploadedFields.length} fields extracted. Ready for TinyFish trace.</span>
                  <button onClick={() => setStep(2)} className="px-4 py-[11px] rounded-[10px] font-semibold text-[13px] bg-[#171717] text-white">
                    Continue to Changes
                  </button>
                </div>
              )}
            </>
          )}
          {step === 2 && (
            <BrowsingStep onComplete={(changes, cu) => {
              setDetectedChanges(changes);
              setChangeUploads(cu);
              setStep(3);
            }} />
          )}
          {step === 3 && (
            <ConsolidationStep
              uploadedFields={uploadedFields}
              changes={detectedChanges}
              changeUploads={changeUploads}
              onComplete={() => setStep(4)}
            />
          )}
          {step === 4 && <PortalStep fill={data.fill} filledValues={filledValues} logs={logs} />}
          {step === 5 && <DoneStep summary={data.summary} />}
        </div>
      </main>
    </div>
  );
}
