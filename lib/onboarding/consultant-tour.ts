// Consultant onboarding tour — spotlight overlay over the real workspace.
//
// The tour rides the real /ops screens (list + project detail) with a
// render-only fake project, so a brand-new consultant with an empty workspace
// still sees the whole flow. Full design/decision log lives in project memory
// (onboarding_tour_decisions.md). Rendering is in
// components/onboarding-tour/ConsultantTour.tsx.

export type ConsultantTourScreen = "list" | "detail";
export type ConsultantTourTab = "workspace" | "available";

export type ConsultantTourStep = {
  id: number;
  screen: ConsultantTourScreen;
  /** Which list tab this step's target lives under (list steps only). */
  listTab?: ConsultantTourTab;
  /** DOM id of the element to spotlight on the fake stage. */
  targetId: string;
  title: string;
  caption: string;
};

/** Sentinel pushed into users.onboarding_steps_seen once the tour is done/skipped. */
export const CONSULTANT_TOUR_SEEN_KEY = "consultant_tour";

/** URL param that opens the tour, e.g. /ops?tour=1 (from the invite card / sidebar link). */
export const CONSULTANT_TOUR_PARAM = "tour";

export const CONSULTANT_TOUR_STEPS: ConsultantTourStep[] = [
  {
    id: 1,
    screen: "list",
    listTab: "workspace",
    targetId: "t-tab-available",
    title: "Available jobs",
    caption: "Jobs nobody has picked up yet live under this tab.",
  },
  {
    id: 2,
    screen: "list",
    listTab: "available",
    targetId: "t-pickup",
    title: "Pick up a job",
    caption: "Spot one you want? Pick it up and it's yours, and it drops off the available list.",
  },
  {
    id: 3,
    screen: "list",
    listTab: "workspace",
    targetId: "t-assigned",
    title: "Jobs assigned to you",
    caption:
      "An admin can also assign you a job directly. It shows up highlighted here, you can accept it right on the card.",
  },
  {
    id: 4,
    screen: "list",
    listTab: "workspace",
    targetId: "t-open",
    title: "Open your project",
    caption: "Once a job is yours, open it to start the work.",
  },
  {
    id: 5,
    screen: "detail",
    targetId: "t-step1",
    title: "Step 1 · Project number",
    caption:
      "If Admin hasn't already set a project number, you can set the Project Number here yourself.",
  },
  {
    id: 6,
    screen: "detail",
    targetId: "t-step2",
    title: "Step 2 · Generate the PBDB",
    caption: "Generate the PBDB document from the client's submission.",
  },
  {
    id: 7,
    screen: "detail",
    targetId: "t-step3",
    title: "Step 3 · QA & upload",
    caption: "Review it, then upload the corrected PBDB — that sends it to the stakeholders.",
  },
];
