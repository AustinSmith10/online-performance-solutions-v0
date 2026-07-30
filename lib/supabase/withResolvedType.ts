// storage-js's uploadToSignedUrl ignores the `contentType` option when the
// upload body is a File/Blob — it sends the File's own native .type via
// FormData instead. Browsers report .eml/.msg inconsistently (often "" or
// application/octet-stream), so the server resolves the correct type from
// the filename extension; this re-wraps the File with that type so it's
// actually the one that reaches Supabase Storage's mime-type allowlist.
export function withResolvedType(file: File, contentType: string): File {
  return new File([file], file.name, { type: contentType });
}
