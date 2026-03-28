const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchPayload() {
  const res = await fetch(`${API_BASE}/api/payload`);
  if (!res.ok) return null;
  return res.json();
}

export async function runPipeline() {
  const res = await fetch(`${API_BASE}/api/pipeline/run`, { method: "POST" });
  if (!res.ok) throw new Error("Pipeline failed");
  return res.json();
}

export function streamPipeline(onEvent: (evt: { step: string; message: string }) => void, onComplete: (payload: any) => void) {
  const es = new EventSource(`${API_BASE}/api/pipeline/stream`, );
  es.addEventListener("progress", (e) => {
    onEvent(JSON.parse(e.data));
  });
  es.addEventListener("complete", (e) => {
    onComplete(JSON.parse(e.data));
    es.close();
  });
  es.onerror = () => es.close();
  return es;
}

export type Payload = {
  generated_at: string;
  client_name: string;
  workflow_name: string;
  breadcrumb_name: string;
  canary_status: string;
  stats: [string, string, string][];
  table: string[][];
  changes: { kind: string; title: string; desc: string; meta: string }[];
  uploads: [string, string, string][];
  groups: [string, [string, string, string][]][];
  actions: [string, string, string, string][];
  fill: [string, string][];
  summary: {
    changes: number;
    rebuilds: number;
    simulated_fields: number;
    real_submissions: number;
    completion_ratio: number;
  };
};
