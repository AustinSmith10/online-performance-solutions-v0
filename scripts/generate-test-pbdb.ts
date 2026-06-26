/**
 * Generates two PBDBs from the first active template:
 *   tmp-pbdb/internal.docx  — red token colour preserved (internal QA copy)
 *   tmp-pbdb/client.docx    — red stripped to black (client-ready copy)
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/generate-test-pbdb.ts
 */
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

function dummyValue(token: string): string {
  const map: Record<string, string> = {
    EXTRACT_ADDRESS:            "42 Waterfront Drive, Hope Island QLD",
    EXTRACT_LOT_NO:             "Lot 42",
    EXTRACT_DP_NO:              "DP 123456",
    EXTRACT_DEV_NAME:           "Halcyon Greens",
    EXTRACT_TRUSTEE:            "HIG Operations Pty Ltd as Trustee for Halcyon Greens Trust",
    EXTRACT_RAINFALL_INTENSITY: "4.8",
    PROJECT_NO:                 "10042-S",
    SYS_GEN_DATE:               fmtDate(new Date()),
    SYS_SUB_DATE:               fmtDate(new Date()),
    SYS_REV_NO:                 "0",
  };
  if (map[token]) return map[token];
  if (token.includes("DATE")) return fmtDate(new Date());
  if (token.startsWith("CLIENT_")) return "Test Client Value";
  return `[${token}]`;
}

function render(templateBuffer: Buffer, context: Record<string, string>, stripRed: boolean): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter() { return ""; },
  });
  doc.render(context);

  const outputZip = doc.getZip();

  if (stripRed) {
    for (const [filename, zipFile] of Object.entries(outputZip.files)) {
      if (/^word\/.*\.xml$/.test(filename) && !(zipFile as { dir: boolean }).dir) {
        const xml = (zipFile as { asText(): string }).asText();
        const stripped = xml.replace(
          /<w:color\b[^>]*w:val="(?:FF0000|EE0000|C00000)"[^>]*\/>/gi,
          ""
        );
        outputZip.file(filename, stripped);
      }
    }
  }

  return outputZip.generate({ type: "nodebuffer" }) as Buffer;
}

async function main() {
  // 1. Find an active template
  // Pick the template that has a real .docx file in storage
  const { data: templates, error: tmplErr } = await sb
    .from("templates")
    .select("id, name, storage_path, org_id")
    .eq("status", "active")
    .not("storage_path", "like", "seed/%")
    .limit(1);

  if (tmplErr || !templates?.length) {
    console.error("No active template found:", tmplErr?.message ?? "empty result");
    process.exit(1);
  }

  const template = templates[0] as { id: string; name: string; storage_path: string; org_id: string };
  console.log(`Template: ${template.name} (${template.id})`);

  // 2. Download the .docx
  const { data: blob, error: dlErr } = await sb.storage
    .from("templates")
    .download(template.storage_path);

  if (dlErr || !blob) {
    console.error("Failed to download template:", dlErr?.message);
    process.exit(1);
  }

  const templateBuffer = Buffer.from(await blob.arrayBuffer());

  // 3. Build context from field mappings + org config
  const [{ data: mappings }, { data: orgData }] = await Promise.all([
    sb.from("template_field_mappings")
      .select("placeholder_token, field_key")
      .eq("template_id", template.id)
      .eq("is_mapped", true),
    sb.from("organisations")
      .select("org_config")
      .eq("id", template.org_id)
      .single(),
  ]);

  const orgConfig = ((orgData?.org_config ?? {}) as Record<string, string>);

  const context: Record<string, string> = {
    PROJECT_NO:   "10042-S",
    SYS_GEN_DATE: fmtDate(new Date()),
    SYS_SUB_DATE: fmtDate(new Date()),
    SYS_REV_NO:   "0",
  };

  for (const m of mappings ?? []) {
    const token = (m as { placeholder_token: string; field_key: string }).placeholder_token;
    const fieldKey = (m as { placeholder_token: string; field_key: string }).field_key;
    context[token] = fieldKey === "org" && orgConfig[token] ? orgConfig[token] : dummyValue(token);
  }

  console.log("Tokens:", Object.keys(context).join(", "));

  // 4. Render both versions
  const outDir = path.join(process.cwd(), "tmp-pbdb");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, "internal.docx"), render(templateBuffer, context, false));
  fs.writeFileSync(path.join(outDir, "client.docx"),   render(templateBuffer, context, true));

  console.log(`\nGenerated:`);
  console.log(`  tmp-pbdb/internal.docx  — red values preserved (internal QA copy)`);
  console.log(`  tmp-pbdb/client.docx    — red stripped to black (client-ready copy)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
