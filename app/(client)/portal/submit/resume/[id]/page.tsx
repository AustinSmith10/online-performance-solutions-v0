import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmissionForm } from "../../_components/SubmissionForm";
import type { ExtractState, TokenField, SectionLabels } from "@/app/actions/submission";
import { getMetricsAutofillConfigs, resolveMetricsAutofill, buildMetricsPickRows } from "@/lib/documents/metrics-autofill";

const RAINFALL_TOKEN = "EXTRACT_RAINFALL_INTENSITY";
const TRUSTEE_TOKEN = "EXTRACT_TRUSTEE";
import type { Confidence } from "@/lib/documents/extractor";

export default async function ResumeDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("stakeholder");
  const supabase = createAdminClient();
  const orgId = user.client_id as string;

  const [{ data: project }, { data: templates }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, status, template_id, extracted_fields, po_number")
      .eq("id", id)
      .eq("client_id", orgId)
      .eq("submitted_by", user.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("templates")
      .select("id, name")
      .eq("client_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name"),
  ]);

  if (!project) notFound();

  if (project.status !== "draft") {
    redirect(`/portal/projects/${id}`);
  }

  const templateId =
    (project.template_id as string | null) ?? templates?.[0]?.id ?? "";

  // Load mappings and org config for this template
  const [{ data: mappings }, { data: orgData }, { data: tmplData }] =
    await Promise.all([
      supabase
        .from("template_field_mappings")
        .select("placeholder_token, field_key, display_label, extraction_hint, is_required")
        .eq("template_id", templateId)
        .eq("is_mapped", true)
        .order("sort_order")
        .order("placeholder_token"),
      supabase
        .from("clients")
        .select("client_config")
        .eq("id", orgId)
        .single(),
      supabase
        .from("templates")
        .select("section_labels")
        .eq("id", templateId)
        .single(),
    ]);

  const allMappings = mappings ?? [];
  const orgConfig = ((orgData?.client_config ?? {}) as Record<string, string>);
  const savedFields: Record<string, string> = { ...((project.extracted_fields ?? {}) as Record<string, string>) };

  const extractMappings = allMappings.filter((m) => m.field_key === "extract");
  const orgMappings = allMappings.filter((m) => m.field_key === "org");
  const clientMappings = allMappings.filter((m) => m.field_key === "client");
  const hasTrustee = extractMappings.some(
    (m) => m.placeholder_token === TRUSTEE_TOKEN
  );
  const hasRainfall = extractMappings.some(
    (m) => m.placeholder_token === RAINFALL_TOKEN
  );
  const rainfallToken = hasRainfall ? RAINFALL_TOKEN : null;

  // Re-resolve any configured client metrics table autofill using saved fields
  const metricsAutofillConfigs = await getMetricsAutofillConfigs(supabase, orgId);
  if (metricsAutofillConfigs.length > 0) {
    const metricsFields: Record<string, { value: string; confidence: string }> = Object.fromEntries(
      Object.entries(savedFields).map(([k, v]) => [k, { value: v, confidence: "low" }])
    );
    resolveMetricsAutofill(metricsAutofillConfigs, metricsFields);
    for (const [token, field] of Object.entries(metricsFields)) {
      savedFields[token] = field.value;
    }
  }

  const trusteePick = hasTrustee ? buildMetricsPickRows(metricsAutofillConfigs, TRUSTEE_TOKEN) : null;

  function makeField(
    m: { placeholder_token: string; display_label: string | null; field_key: string | null; is_required: boolean },
    value: string,
    confidence: Confidence = "low",
    required = false
  ): TokenField {
    return {
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      value,
      confidence,
      required,
    };
  }

  const tokenGroups = {
    extract: extractMappings.map((m) => {
      const value = savedFields[m.placeholder_token] ?? "";
      return makeField(m, value, value.trim() ? "high" : "low", m.is_required);
    }),
    org: orgMappings.map((m) =>
      makeField(m, savedFields[m.placeholder_token] ?? orgConfig[m.placeholder_token] ?? "", "high", false)
    ),
    client: clientMappings.map((m) =>
      makeField(m, savedFields[m.placeholder_token] ?? "", "high", m.is_required)
    ),
  };

  const activeTemplates = (templates ?? []) as { id: string; name: string }[];
  const defaultTemplateId =
    activeTemplates.length === 1 ? activeTemplates[0].id : null;

  const rawLabels = (tmplData?.section_labels ?? {}) as Record<string, string>;
  const sectionLabels: SectionLabels = {
    extract: rawLabels.extract || "Extracted from your documents",
    extractDesc: rawLabels.extractDesc || "Review and correct any fields marked below before submitting.",
    trusteeDesc: rawLabels.trusteeDesc || "",
    org: rawLabels.org || "Client details",
    orgDesc: rawLabels.orgDesc || "These details are pre-filled from your organisation's configuration.",
    client: rawLabels.client || "Additional information",
    clientDesc: rawLabels.clientDesc || "Please fill in the remaining details required for this report.",
  };

  const initialState: ExtractState = {
    step: 2,
    poNumber: {
      value: (project.po_number as string | null) ?? "",
      confidence: "medium",
    },
    tokenGroups,
    sectionLabels,
    hasTrustee,
    rainfallToken,
    matchToken: trusteePick?.matchToken ?? null,
    pickRows: trusteePick?.rows ?? [],
    projectId: id,
    templateId,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <Link href="/portal" className="text-sm text-zinc-500 hover:text-zinc-700">
        ← My Reports
      </Link>
      <SubmissionForm
        templates={activeTemplates}
        defaultTemplateId={defaultTemplateId}
        initialState={initialState}
      />
    </div>
  );
}
