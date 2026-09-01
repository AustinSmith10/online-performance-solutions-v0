"use client";

import { useEffect, useState } from "react";
import { getRedispatchPanelData, type RedispatchPanelData } from "@/app/actions/revision-review";
import { PbdbSendPreview } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbSendPreview";
import { PbdbReuploadToggle } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbReuploadToggle";
import { PbdbDispatchSchedule } from "@/app/(admin)/admin/projects/[id]/_components/PbdbDispatchSchedule";
import { ProjectDeliveryDelayPresetSelect } from "@/components/ProjectDeliveryDelayPresetSelect";
import { DispatchButton } from "@/app/(admin)/admin/projects/[id]/_components/DispatchButton";

/**
 * The redispatch step, rendered inside the consultant dashboard's revision
 * drawer so the consultant can preview the revised PBDB, swap in a different
 * file, set the delivery timing and resend — without having to open the full
 * project page. Data is fetched lazily on mount (the drawer is opened on
 * demand) via getRedispatchPanelData, which mirrors the project page's
 * `ready_to_redispatch` FocusCard.
 */
export function DrawerRedispatchPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: RedispatchPanelData }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getRedispatchPanelData(projectId).then((res) => {
      if (cancelled) return;
      setState(
        res.ok
          ? { status: "ready", data: res.data }
          : { status: "error", message: res.error }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (state.status === "loading") {
    return <p className="text-xs text-green-800">Loading redispatch options…</p>;
  }
  if (state.status === "error") {
    return <p className="text-xs text-red-600">{state.message}</p>;
  }

  const d = state.data;
  return (
    <div className="space-y-4">
      <PbdbSendPreview
        projectId={projectId}
        fileId={d.pbdbFileId}
        findings={d.sendFindings}
        acknowledged={d.flagsAcknowledged}
      />

      {d.readyToSend &&
        (d.scheduledFor ? (
          <PbdbDispatchSchedule projectId={projectId} scheduledFor={d.scheduledFor} />
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-500">Delivery timing</p>
              <ProjectDeliveryDelayPresetSelect
                projectId={projectId}
                initialValue={d.deliveryPreset}
                durations={d.deliveryDurations}
                docType="pbdb"
                projectedSendDate={d.projectedSendDate}
              />
            </div>
            <DispatchButton projectId={projectId} />
          </>
        ))}

      <div className="border-t border-green-200/60 pt-3">
        <PbdbReuploadToggle projectId={projectId} />
      </div>
    </div>
  );
}
