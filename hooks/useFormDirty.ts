"use client";

import { useState } from "react";

// Save stays disabled until the form has been edited, so a page of
// independent forms doesn't imply pending edits. Server-side validation
// errors keep it enabled so the admin can retry.
export function useFormDirty(hasErrors: boolean) {
  const [edited, setEdited] = useState(false);
  return {
    dirty: edited || hasErrors,
    formProps: {
      onChange: () => setEdited(true),
      onSubmit: () => setEdited(false),
    },
  };
}
