"use client";

import { useActionState } from "react";
import { requestNewApprovalLink, type RequestNewLinkState } from "@/app/actions/approval";

interface Props {
  token: string;
}

export function RequestNewLinkForm({ token }: Props) {
  const boundAction = requestNewApprovalLink.bind(null, token);
  const [state, formAction, pending] = useActionState<RequestNewLinkState, FormData>(
    boundAction,
    {}
  );

  if (state.sent) {
    return (
      <p style={{ marginTop: "20px", fontSize: "14px", color: "#15803d" }}>
        A new link has been sent to your email address.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: "20px" }}>
      {state.error && (
        <p style={{ marginBottom: "12px", fontSize: "14px", color: "#dc2626" }}>{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        style={{
          display: "inline-block",
          backgroundColor: "#18181b",
          color: "#ffffff",
          padding: "12px 24px",
          borderRadius: "6px",
          fontSize: "14px",
          fontWeight: 500,
          border: "none",
          opacity: pending ? 0.6 : 1,
          cursor: pending ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "Sending…" : "Request a new link"}
      </button>
    </form>
  );
}
