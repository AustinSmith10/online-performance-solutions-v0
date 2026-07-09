// Single source for the client-facing support contact — every "contact support"
// link across the app should read from here instead of hardcoding an address.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@ddeg.com.au";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
