import type { ExtractionStatus } from "./continueGate";

export interface FileRequirement {
  id: string;
  name: string;
  slug: string;
  max_count: number;
  required: boolean;
  no_duplicates: boolean;
  extraction: boolean;
}

/**
 * One file's client-side pipeline state (#115) — covers the full lifecycle
 * from local drop through upload, verification, and (where applicable)
 * extraction. `objectUrl` is a local blob URL (`URL.createObjectURL`) so a
 * flagged file's preview shows the stakeholder's own upload without waiting
 * on a server-issued signed URL.
 */
export interface ClientPipelineFile {
  localId: string;
  requirementId: string;
  slug: string;
  name: string;
  size: number;
  objectUrl: string;
  fileId: string | null;
  uploading: boolean;
  error: string | null;
  verificationCompleted: boolean;
  mismatchReasons: string[] | null;
  confirmed: boolean;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
}

export function isSettled(f: ClientPipelineFile): boolean {
  if (f.uploading || f.error) return false;
  if (!f.verificationCompleted) return false;
  if (f.mismatchReasons && !f.confirmed) return false;
  return f.extractionStatus === "not_applicable" || f.extractionStatus === "completed";
}
