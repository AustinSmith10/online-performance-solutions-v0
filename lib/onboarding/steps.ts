export type TourStepConfig = {
  id: string;
  title: string;
  text: string;
  // Where this step's target actually lives. If the tour reaches this step
  // and the browser isn't there, it navigates there automatically — a
  // spotlight on an element the user can't currently see isn't guidance.
  // Omitted for steps whose target is wherever the user already is
  // (e.g. qa_upload, whose page is only known dynamically after acceptance).
  path?: string;
};

export const ADMIN_TOUR_STEPS: TourStepConfig[] = [
  {
    id: "admin_intro",
    title: "Welcome to the admin dashboard",
    text: "A quick rundown of what needs your attention and where everything else lives.",
  },
  {
    id: "admin_action_queue",
    title: "Action required",
    text: "Unassigned, overdue, awaiting-stakeholder, and override-pending jobs surface here first — work through these before anything else.",
  },
  {
    id: "admin_active_projects",
    title: "Active projects",
    text: "Every in-flight job lives in the table below. Clients, Stakeholders, Internal Users, Templates, Credits, and Audit are in the sidebar for everything else.",
  },
];

// The original consultant onboarding tour was a spotlight overlay over a
// hand-built fake replica of the /ops UI; it drifted out of sync with the
// real UI and was replaced with the static step list card
// (app/(consultant)/ops/_components/OnboardingCard.tsx). This spotlight
// tour runs *after* that card is dismissed (see OnboardingFlow.tsx) — the
// card covers the end-to-end job lifecycle, so these steps only need to
// point at the two things on the page itself: the summary/hero cluster and
// the tab bar underneath it.
export const CONSULTANT_TOUR_STEPS: TourStepConfig[] = [
  {
    id: "consultant_dashboard_summary",
    title: "Keep an eye on this",
    text: "These tiles and the banner above always surface what needs a decision from you right now.",
  },
  {
    id: "consultant_project_tabs",
    title: "Everything else lives here",
    text: "Switch between tabs to see projects at each stage — Active, With stakeholders, Archive, and Available jobs.",
  },
];

export const STAKEHOLDER_TOUR_STEPS: TourStepConfig[] = [
  {
    id: "stakeholder_intro",
    title: "Welcome to your report portal",
    text: "Submit report requests, track their progress, and download the finished reports — all from here. Start a new request any time with the button top-right.",
  },
  {
    id: "stakeholder_action_items",
    title: "What needs you",
    text: "These tiles and the banner below always show what needs your review or is ready to download right now.",
  },
  {
    id: "stakeholder_project_list",
    title: "Every request lives here",
    text: "Click into any request to see its full history, review comments, and downloads.",
  },
];
