/**
 * Who may put a tag on whom (#213). Pure so the same rule is unit-tested and
 * enforced server-side in the assign/unassign actions.
 *
 * - super admin: any account
 * - admin: stakeholders and consultants
 * - consultant: themselves, and any stakeholder — never another consultant
 * - stakeholder: nothing, and never sees tags at all
 */
export type TagActorRole = "super_admin" | "admin" | "consultant" | "stakeholder";

export function canAssignTag(
  actor: { id: string; role: string },
  target: { id: string; role: string }
): boolean {
  switch (actor.role) {
    case "super_admin":
      return true;
    case "admin":
      return target.role === "stakeholder" || target.role === "consultant";
    case "consultant":
      return target.role === "stakeholder" || (target.role === "consultant" && target.id === actor.id);
    default:
      return false;
  }
}

/** Roles that may see tags anywhere in the UI. Stakeholders never do. */
export function canSeeTags(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "admin" || role === "consultant";
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normaliseTagInput(name: string, color: string): { name: string; color: string } | { error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a tag name." };
  if (trimmed.length > 40) return { error: "Tag names are 40 characters or fewer." };
  if (!HEX.test(color)) return { error: "Pick a valid colour." };
  return { name: trimmed, color: color.toLowerCase() };
}
