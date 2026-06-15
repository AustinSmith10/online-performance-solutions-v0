import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmissionForm } from "../../_components/SubmissionForm";
import type { ExtractState, Development } from "@/app/actions/submission";
import type { ExtractionResult, ExtractedField } from "@/lib/documents/extractor";

const EMPTY_FIELD: ExtractedField = { value: "", confidence: "low" };

function toExtractionResult(raw: unknown): ExtractionResult {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  function field(key: string): ExtractedField {
    const v = r[key];
    if (v && typeof v === "object" && "value" in (v as object)) {
      const f = v as Record<string, unknown>;
      return {
        value: typeof f.value === "string" ? f.value : "",
        confidence: (f.confidence as ExtractedField["confidence"]) ?? "low",
      };
    }
    return { ...EMPTY_FIELD };
  }

  return {
    po_number: field("po_number"),
    client_address: field("client_address"),
    house_type: field("house_type"),
    site_wd_no: field("site_wd_no"),
    floor_wd_no: field("floor_wd_no"),
    roof_wd_no: field("roof_wd_no"),
    draw_date: field("draw_date"),
    dev_name: field("dev_name"),
  };
}

export default async function ResumeDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("client");
  const supabase = createAdminClient();
  const orgId = user.org_id as string;

  const [{ data: project }, { data: templates }, { data: devsData }, { data: orgData }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, status, template_id, extracted_fields")
        .eq("id", id)
        .eq("org_id", orgId)
        .eq("submitted_by", user.id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("templates")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("halcyon_developments")
        .select("dev_name, trustee_entity")
        .order("dev_name"),
      supabase
        .from("organisations")
        .select("org_config")
        .eq("id", orgId)
        .single(),
    ]);

  if (!project) notFound();

  // Only drafts can be resumed — submitted/active projects go to the detail page
  if (project.status !== "draft") {
    redirect(`/portal/projects/${id}`);
  }

  const templateId = (project.template_id as string | null) ?? templates?.[0]?.id ?? "";

  const extracted = toExtractionResult(project.extracted_fields);
  const orgConfig = ((orgData?.org_config ?? {}) as Record<string, string>);
  const developments = (devsData ?? []) as Development[];
  const activeTemplates = (templates ?? []) as { id: string; name: string }[];
  const defaultTemplateId = activeTemplates.length === 1 ? activeTemplates[0].id : null;

  const initialState: ExtractState = {
    step: 2,
    extracted,
    projectId: id,
    templateId,
    orgConfig,
    developments,
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-900">Continue report request</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Review the extracted details below and submit when ready.
        </p>
      </div>
      <SubmissionForm
        templates={activeTemplates}
        defaultTemplateId={defaultTemplateId}
        initialState={initialState}
      />
    </div>
  );
}
