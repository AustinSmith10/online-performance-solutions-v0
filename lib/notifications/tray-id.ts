// Single source of truth for how a raw row's id maps to its TrayEntry id, so
// lib/admin/needs-attention.ts can filter out resolved signals (tracked in
// the resolved_signals table by this same id) without duplicating the scheme.
// Split into its own module (rather than living in tray.ts) to avoid a
// circular import: tray.ts imports signal types from needs-attention.ts,
// and needs-attention.ts needs these id builders to filter resolved rows.
export const trayId = {
  notification: (id: string) => `notif-${id}`,
  job: (id: string) => `job-${id}`,
  bounce: (id: string) => `bounce-${id}`,
  stalled: (id: string) => `stalled-${id}`,
  pending: (id: string) => `pending-${id}`,
  expiring: (id: string) => `expiring-${id}`,
  overdue: (id: string) => `overdue-${id}`,
  creditRace: (id: string) => `credit-race-${id}`,
};
