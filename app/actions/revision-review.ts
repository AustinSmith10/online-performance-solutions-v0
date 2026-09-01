"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/auth/project-access";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { previewNextSendTime } from "@/lib/documents/pending-delivery";
import type { DeliveryDelayDurations, DeliveryDelayPreset } from "@/lib/delivery/delivery-delay";

export interface RedispatchPanelData {
  pbdbFileId: string;
  /** Deterministic structure-scan findings on the latest PBDB (#112). */
  sendFindings: string[];
  flagsAcknowledged: boolean;
  /** Whether Send is unlocked — no findings, or findings acknowledged. */
  readyToSend: boolean;
  /** ISO datetime of an already-scheduled PBDB delivery, if one is pending. */
  scheduledFor: string | null;
  deliveryPreset: DeliveryDelayPreset;
  deliveryDurations: DeliveryDelayDurations;
  /** ISO date the PBDB would actually send with the saved preset (#176). */
  projectedSendDate?: string;
}

export type RedispatchPanelResult =
  | { ok: true; data: RedispatchPanelData }
  | { ok: false; error: string };

/**
 * Everything the redispatch panel in the consultant dashboard drawer needs —
 * fetched lazily when the drawer opens rather than bloating the dashboard
 * list query with a per-project delivery-time preview + file read. Mirrors
 * the `ready_to_redispatch` FocusCard on the full project page so the drawer
 * can't show a different picture.
 */
export async function getRedispatchPanelData(projectId: string): Promise<RedispatchPanelResult> {
  const actor = await requireRole("consultant", "admin", "super_admin");
  const supabase = createAdminClient();

  const project = await requireProjectAccess(supabase, actor, projectId);
  if (!project) return { ok: false, error: "Project not found or access denied." };

  const { data: pbdbFiles } = await supabase
    .from("project_files")
    .select("id, structure_scan_findings, qa_flags_acknowledged_at")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .order("version", { ascending: true });

  const latestPbdb = (pbdbFiles ?? [])[(pbdbFiles ?? []).length - 1] ?? null;
  if (!latestPbdb) return { ok: false, error: "No PBDB file found for this project." };

  const sendFindings =
    (latestPbdb.structure_scan_findings as { message: string }[] | null)?.map((f) => f.message) ?? [];
  const flagsAcknowledged = !!latestPbdb.qa_flags_acknowledged_at;

  const [deliveryDurations, pendingPbdbDelivery, sendPreview] = await Promise.all([
    getDeliveryDelayDurations(supabase),
    supabase
      .from("pending_deliveries")
      .select("scheduled_for")
      .eq("project_id", projectId)
      .eq("delivery_type", "pbdb")
      .maybeSingle(),
    previewNextSendTime(projectId, "pbdb").catch(() => null),
  ]);

  return {
    ok: true,
    data: {
      pbdbFileId: latestPbdb.id as string,
      sendFindings,
      flagsAcknowledged,
      readyToSend: sendFindings.length === 0 || flagsAcknowledged,
      scheduledFor: (pendingPbdbDelivery.data?.scheduled_for as string | undefined) ?? null,
      deliveryPreset: (project.pbdb_delivery_delay_preset as DeliveryDelayPreset | null) ?? "expedited",
      deliveryDurations,
      projectedSendDate: sendPreview ? sendPreview.toISOString() : undefined,
    },
  };
}
