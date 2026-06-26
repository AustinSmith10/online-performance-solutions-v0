import { requireRole } from "@/lib/auth/session";
import { ProfileForm } from "@/components/ProfileForm";

export default async function AdminProfilePage() {
  const user = await requireRole("super_admin", "admin");
  return (
    <ProfileForm
      profile={{
        email: user.email as string,
        first_name: user.first_name as string | null,
        last_name: user.last_name as string | null,
        phone: user.phone as string | null,
        company_role: user.company_role as string | null,
        state_territory: user.state_territory as string | null,
      }}
    />
  );
}
