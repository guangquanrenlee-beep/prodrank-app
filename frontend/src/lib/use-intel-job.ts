"use client";

/* Live-progress wrapper for the intelligence job API.
   POST /api/intel/start → poll /api/intel/job/{id} every 2s until done.
   The full report comes back in the final poll — no separate /result call.
   The backend returns `stage` strings: fetch, fields, knowledge, entity,
   compare, complete, error. */

import { useCallback, useEffect, useRef, useState } from "react";

export interface IntelJob {
  job_id: string;
  status: "running" | "done" | "error";
  stage: string;
  fields_done: number;
  fields_total: number;
  pct: number;
  result: any | null;
  error: string | null;
}

export interface IntelJobCallbacks {
  onResult?: (result: any) => void;
  onError?: (message: string) => void;
}

const STAGE_LABELS: Record<string, string> = {
  fetch: "Fetching product page…",
  fields: "AI agents reading your page…",
  knowledge: "Analyzing AI knowledge coverage…",
  entity: "Building AI entity profile…",
  compare: "Cross-checking AI understanding…",
  complete: "Done",
};

export function stageLabel(stage: string, job: IntelJob | null): string {
  if (stage === "fields" && job && job.fields_total > 0) {
    return `AI agents reading your page (${job.fields_done}/${job.fields_total})…`;
  }
  return STAGE_LABELS[stage] || "Analyzing…";
}

export function useIntelJob() {
  const [job, setJob] = useState<IntelJob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(
    async (url: string, brand: string, category: string, cb: IntelJobCallbacks = {}) => {
      stopPolling();
      setJob(null);

      let res: Response;
      try {
        res = await fetch("/api/intel/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, brand, category }),
        });
      } catch (e: any) {
        cb.onError?.(e.message || "Failed to start analysis");
        setJob({ job_id: "", status: "error", stage: "error", fields_done: 0, fields_total: 0, pct: 0, result: null, error: e.message || "Failed to start analysis" });
        return;
      }
      if (!res.ok) {
        const msg = (await res.text().catch(() => "")) || "Failed to start analysis";
        cb.onError?.(msg);
        setJob({ job_id: "", status: "error", stage: "error", fields_done: 0, fields_total: 0, pct: 0, result: null, error: msg });
        return;
      }
      const { job_id } = await res.json();
      if (!job_id) {
        cb.onError?.("No job id returned");
        setJob({ job_id: "", status: "error", stage: "error", fields_done: 0, fields_total: 0, pct: 0, result: null, error: "No job id returned" });
        return;
      }

      // First progress snapshot right away so the bar shows immediately.
      const poll = async () => {
        try {
          const r = await fetch(`/api/intel/job/${job_id}`);
          if (!r.ok) throw new Error(await r.text());
          const j: IntelJob = await r.json();
          setJob(j);
          if (j.status === "done") {
            stopPolling();
            cb.onResult?.(j.result);
          } else if (j.status === "error") {
            stopPolling();
            cb.onError?.(j.error || "Analysis failed");
          }
        } catch (e: any) {
          stopPolling();
          cb.onError?.(e.message || "Analysis failed");
        }
      };
      await poll();
      timerRef.current = setInterval(poll, 2000);
    },
    [stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    setJob(null);
  }, [stopPolling]);

  return { job, start, reset };
}
