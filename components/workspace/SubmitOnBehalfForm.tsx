"use client";

// Shared by the admin and consultant "submit on behalf of a client" pages.
// Client + stakeholder are just the first two fields on the same page as
// the rest of the request — picking one populates the fields below it
// in place. No separate screens, no query-param navigation.

import { useState } from "react";
import { SubmissionForm } from "@/app/(client)/portal/submit/_components/SubmissionForm";
import { BackLink } from "@/components/BackLink";
import { StakeholderPicker, type PickerStakeholder } from "./StakeholderPicker";

type Org = { id: string; name: string };
type Stakeholder = PickerStakeholder;
type Template = { id: string; name: string };
type FileRequirement = {
  id: string;
  name: string;
  slug: string;
  max_count: number;
  required: boolean;
  no_duplicates: boolean;
  extraction: boolean;
};

const COPY = {
  admin: {
    noTemplatesHint: "has no active templates. Activate one before submitting.",
  },
  consultant: {
    noTemplatesHint: "has no active templates. An admin needs to activate one before you can submit.",
  },
};

const selectClass =
  "w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";

export function SubmitOnBehalfForm({
  mode,
  clients,
  stakeholdersByClient,
  templatesByClient,
  requirementsByTemplate,
  projectBasePath,
  backHref,
  backLabel,
  submitPath,
}: {
  mode: "admin" | "consultant";
  clients: Org[];
  stakeholdersByClient: Record<string, Stakeholder[]>;
  templatesByClient: Record<string, Template[]>;
  requirementsByTemplate: Record<string, FileRequirement[]>;
  projectBasePath: string;
  backHref: string;
  backLabel: string;
  submitPath: string;
}) {
  const [orgId, setOrgId] = useState("");
  const [stakeholderId, setStakeholderId] = useState("");
  const copy = COPY[mode];

  const selectedOrg = clients.find((o) => o.id === orgId);
  const stakeholders = orgId ? stakeholdersByClient[orgId] ?? [] : [];
  const templates = orgId ? templatesByClient[orgId] ?? [] : [];
  const defaultTemplateId = templates.length === 1 ? templates[0].id : null;

  const pickerFields = (
    <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-zinc-700">
          Client <span className="text-red-500">*</span>
          <select
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              setStakeholderId("");
            }}
            className={`mt-1 ${selectClass}`}
          >
            <option value="" disabled>Select a client…</option>
            {clients.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-700">
          Stakeholder account <span className="text-red-500">*</span>
          <div className="mt-1">
            <StakeholderPicker
              stakeholders={stakeholders}
              value={stakeholderId}
              onChange={setStakeholderId}
              disabled={!orgId || stakeholders.length === 0}
              placeholder={!orgId ? "Select a client first" : stakeholders.length === 0 ? "No stakeholder accounts" : "Select a stakeholder…"}
              className={selectClass}
            />
          </div>
        </label>
      </div>

      {orgId && stakeholders.length === 0 && (
        <p className="sm:col-span-2 text-xs text-zinc-500">
          {selectedOrg?.name} has no registered stakeholder accounts.
        </p>
      )}
      {orgId && templates.length === 0 && (
        <p className="sm:col-span-2 text-xs text-zinc-500">
          {selectedOrg?.name} {copy.noTemplatesHint}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
      <BackLink href={backHref}>{backLabel}</BackLink>
      {/* Rendered as its own block, not nested inside SubmissionForm's Right
          Now card — choosing who this is for is the actual first step here,
          not a preamble to file upload, and DESIGN.md's one-container rule
          rules out a bordered box inside another bordered card anyway. */}
      {pickerFields}
      {/* Keyed on orgId so switching clients cleanly resets any in-progress
          template/file selection instead of carrying over stale state. */}
      <SubmissionForm
        key={orgId || "none"}
        templates={templates}
        defaultTemplateId={defaultTemplateId}
        requirementsByTemplate={requirementsByTemplate}
        adminOrgId={orgId}
        adminClientId={stakeholderId}
        projectBasePath={projectBasePath}
        startOverHref={submitPath}
        headerTitle={selectedOrg ? `New report request — on behalf of ${selectedOrg.name}` : "New report request — on behalf of a client"}
        viewerRole="staff"
      />
    </div>
  );
}
