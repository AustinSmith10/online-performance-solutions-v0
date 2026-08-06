"use client";

import { useCallback, useEffect, useRef } from "react";
import { getDraftPipelineStatus, type DraftPipelineStatus } from "@/app/actions/submission-pipeline";

const POLL_MS = 4000;

/**
 * Status communication for the real-time pipeline (#115): a lightweight
 * server-action poll rather than Supabase Realtime, sidestepping the
 * per-role RLS-visibility gaps that force RealtimeRefresh.tsx's own
 * fallback poll (this draft is visible to the stakeholder, a consultant
 * submitting on their behalf, or an admin submitting on their behalf, each
 * under different RLS scoping — a server action via createAdminClient
 * avoids the issue entirely).
 *
 * Every direct pipeline action call (upload, confirm, retry) already
 * updates local state from its own return value, so this hook exists for
 * two narrower cases: rehydrating an already-in-progress draft on mount
 * (surviving a page refresh), and a defensive periodic reconciliation while
 * anything is still unsettled, in case a direct call's response was lost
 * (e.g. the tab was backgrounded mid-request).
 */
export function useDraftPipelinePolling(
  projectId: string | null,
  templateId: string,
  active: boolean,
  onStatus: (status: DraftPipelineStatus) => void
) {
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  const refresh = useCallback(async () => {
    if (!projectId || !templateId) return;
    try {
      const status = await getDraftPipelineStatus(projectId, templateId);
      onStatusRef.current(status);
    } catch (err) {
      console.error("[useDraftPipelinePolling] status fetch failed:", err);
    }
  }, [projectId, templateId]);

  useEffect(() => {
    if (!active || !projectId) return;
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [active, projectId, refresh]);

  return { refresh };
}
