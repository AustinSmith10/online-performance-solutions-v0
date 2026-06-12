import ConfirmClient from "./_components/confirm-client";

interface Props {
  searchParams: Promise<{
    code?: string;
    token_hash?: string;
    type?: string;
    next?: string;
  }>;
}

export default async function AuthConfirmPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <ConfirmClient
      next={params.next ?? "/complete-profile"}
      code={params.code}
      tokenHash={params.token_hash}
      type={params.type}
    />
  );
}
