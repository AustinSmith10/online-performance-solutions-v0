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

// The consultant onboarding tour was a spotlight overlay over a hand-built
// fake replica of the /ops UI; it drifted out of sync with the real UI and
// was replaced with a static step list card (app/(consultant)/ops/_components/OnboardingCard.tsx).
// This file now only serves the admin dashboard tour.
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
