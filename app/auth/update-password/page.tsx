import UpdatePasswordClient from "./_components/update-password-client";

interface Props {
  searchParams: Promise<{
    code?: string;
    token_hash?: string;
    type?: string;
  }>;
}

export default async function UpdatePasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm">
        <UpdatePasswordClient
          code={params.code}
          tokenHash={params.token_hash}
          type={params.type}
        />
      </div>
    </div>
  );
}
