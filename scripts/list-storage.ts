import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { data: templates } = await sb
    .from("templates")
    .select("id, name, status, storage_path, org_id")
    .order("created_at", { ascending: false });

  console.log("Templates in DB:");
  for (const t of templates ?? []) {
    console.log(` [${(t as { status: string }).status}] ${(t as { name: string }).name}`);
    console.log(`   id: ${(t as { id: string }).id}`);
    console.log(`   storage_path: ${(t as { storage_path: string }).storage_path}`);

    // Try to list the folder
    const parts = ((t as { storage_path: string }).storage_path as string).split("/");
    const folder = parts.slice(0, -1).join("/");
    const { data: files } = await sb.storage.from("templates").list(folder);
    console.log(`   files in ${folder}:`, files?.map((f: { name: string }) => f.name) ?? "none/error");
  }
}

main().catch(console.error);
