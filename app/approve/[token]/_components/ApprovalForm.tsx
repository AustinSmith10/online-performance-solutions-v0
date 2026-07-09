"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitApproval, type ApprovalState } from "@/app/actions/approval";
import { SUPPORT_MAILTO } from "@/lib/config/support";

interface Props {
  token: string;
  reviewId?: string;
  redirectAfterSubmit?: boolean;
}

export function ApprovalForm({ token, reviewId, redirectAfterSubmit }: Props) {
  const router = useRouter();
  const boundAction = submitApproval.bind(null, token, reviewId ?? null);
  const [state, formAction, pending] = useActionState<ApprovalState, FormData>(
    boundAction,
    {}
  );
  const [response, setResponse] = useState<"approved" | "rejected">("approved");

  useEffect(() => {
    if (state.submitted) {
      if (redirectAfterSubmit) {
        router.replace("/portal");
      } else {
        router.refresh();
      }
    }
  }, [state.submitted, redirectAfterSubmit, router]);

  return (
    <form action={formAction} style={{ marginTop: "24px" }}>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={legendStyle}>Your response</legend>

        <label style={labelStyle}>
          <input
            type="radio"
            name="response"
            value="approved"
            checked={response === "approved"}
            onChange={() => setResponse("approved")}
            style={{ marginRight: "8px" }}
          />
          Approved
        </label>

        <label style={labelStyle}>
          <input
            type="radio"
            name="response"
            value="rejected"
            checked={response === "rejected"}
            onChange={() => setResponse("rejected")}
            style={{ marginRight: "8px" }}
          />
          Rejected
        </label>
      </fieldset>

      <div style={{ marginTop: "16px" }}>
        <label htmlFor="comments" style={commentLabelStyle(response)}>
          {response === "rejected" ? "Reason for rejection" : "Comments"}{" "}
          <span style={{ fontWeight: 400, color: "#71717a" }}>
            {response === "rejected" ? "(required)" : "(optional)"}
          </span>
        </label>

        {response === "rejected" && (
          <p style={hintStyle}>
            Describe what needs to change — reference specific page numbers, sections, or
            clauses where possible. This helps the team resolve your concern as quickly as
            possible.
          </p>
        )}

        <textarea
          id="comments"
          name="comments"
          rows={4}
          required={response === "rejected"}
          style={textareaStyle}
          placeholder={
            response === "rejected"
              ? "e.g. Page 4, Section J.0 — the thermal bridging U-value appears incorrect. Please revise before resubmitting."
              : "Any additional notes for the team…"
          }
        />
      </div>

      {state.error && (
        <p style={{ marginTop: "12px", fontSize: "14px", color: "#dc2626" }}>
          {state.error}
          {state.expired && (
            <>
              {" "}
              Please{" "}
              <a href={SUPPORT_MAILTO} style={{ color: "#dc2626" }}>
                contact DDEG
              </a>{" "}
              for a new link.
            </>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          ...submitButtonStyle,
          backgroundColor: response === "rejected" ? "#dc2626" : "#18181b",
          opacity: pending ? 0.6 : 1,
          cursor: pending ? "not-allowed" : "pointer",
        }}
      >
        {pending
          ? "Submitting…"
          : response === "rejected"
          ? "Submit rejection"
          : "Approve"}
      </button>
    </form>
  );
}

const legendStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#18181b",
  marginBottom: "12px",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  fontSize: "15px",
  color: "#3f3f46",
  marginBottom: "10px",
  cursor: "pointer",
};

function commentLabelStyle(response: "approved" | "rejected"): React.CSSProperties {
  return {
    display: "block",
    fontSize: "14px",
    fontWeight: 500,
    color: response === "rejected" ? "#991b1b" : "#3f3f46",
    marginBottom: "4px",
  };
}

const hintStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#71717a",
  margin: "0 0 8px",
  lineHeight: 1.5,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "6px",
  border: "1px solid #d4d4d8",
  padding: "10px 12px",
  fontSize: "14px",
  color: "#18181b",
  resize: "vertical",
  boxSizing: "border-box",
};

const submitButtonStyle: React.CSSProperties = {
  marginTop: "20px",
  display: "inline-block",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 500,
  border: "none",
  transition: "background-color 0.15s",
};
