import { redirect } from "next/navigation";

// Tags now live in Settings → Tags. Kept so old links and bookmarks still land there.
export default function AdminTagsPage() {
  redirect("/admin/settings?tab=tags");
}
