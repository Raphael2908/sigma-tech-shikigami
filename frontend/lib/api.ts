const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchPayload() {
  try {
    const res = await fetch(`${API_BASE}/api/payload`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
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

export async function uploadFiles(files: FileList): Promise<{
  uploads: [string, string, string][];
  extracted_fields: { field_id: string; value: string; description: string }[];
}> {
  const form = new FormData();
  for (const file of Array.from(files)) {
    form.append("files", file);
  }
  const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function streamBrowse(
  onProgress: (evt: { step: string; message: string; node_url?: string }) => void,
  onStreamingUrl: (url: string) => void,
  onComplete: (data: { changes: ChangeItem[]; canary_status: string; extraction_count: number }) => void,
  onError?: (msg: string) => void,
) {
  try {
    const res = await fetch(`${API_BASE}/api/pipeline/stream-browse`);
    if (!res.ok || !res.body) {
      onError?.(`Backend returned ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === "progress") {
              onProgress(data);
            } else if (currentEvent === "streaming_url") {
              onStreamingUrl(data.url);
            } else if (currentEvent === "complete") {
              onComplete(data);
              return;
            }
          } catch {
            // skip unparseable data
          }
          currentEvent = "message";
        }
      }
    }
  } catch (e) {
    onError?.(e instanceof Error ? e.message : "Connection failed");
  }
}

export async function streamConsolidate(
  body: { uploaded_files: any[]; changes: any[]; change_uploads: any[] },
  onReasoning: (evt: ReasoningItem) => void,
  onProgress: (evt: { step: string; message: string }) => void,
  onComplete: (data: { pdf_url: string; field_count: number }) => void,
) {
  const res = await fetch(`${API_BASE}/api/consolidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Consolidation failed");
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        const eventType = line.slice(7).trim();
        // Next line should be data:
        continue;
      }
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        // Determine event type from the data shape
        if ("field" in data && "source_doc" in data) {
          onReasoning(data as ReasoningItem);
        } else if ("pdf_url" in data) {
          onComplete(data);
        } else if ("step" in data) {
          onProgress(data);
        }
      }
    }
  }
}

export type ChangeItem = {
  kind: string;
  title: string;
  desc: string;
  meta: string;
};

export type ReasoningItem = {
  field: string;
  source_doc: string;
  value: string;
  confidence: string;
  reason: string;
};

export type Payload = {
  generated_at: string;
  client_name: string;
  workflow_name: string;
  breadcrumb_name: string;
  canary_status: string;
  stats: [string, string, string][];
  table: string[][];
  changes: ChangeItem[];
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
