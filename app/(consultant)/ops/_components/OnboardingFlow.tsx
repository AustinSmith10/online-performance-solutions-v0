"use client";

// Sequences the two pieces of consultant first-run onboarding so they never
// show at once: the "how jobs flow" card first, then — once dismissed — the
// spotlight tour over the dashboard itself (mirrors the admin dashboard
// tour). "Replay" (the header's "How this works" link) restarts the whole
// sequence from the card, not just the tour.

import { useEffect, useState } from "react";
import { OnboardingCard } from "./OnboardingCard";
import { OnboardingTourProvider, REPLAY_TOUR_EVENT } from "@/components/onboarding-tour/context";
import { CONSULTANT_TOUR_STEPS } from "@/lib/onboarding/steps";

export function OnboardingFlow({
  seenConsultantTour,
  seenSteps,
  replay,
  children,
}: {
  seenConsultantTour: boolean;
  seenSteps: string[];
  replay: boolean;
  children: React.ReactNode;
}) {
  const [cardVisible, setCardVisible] = useState(replay || !seenConsultantTour);

  useEffect(() => {
    function onReplay() {
      setCardVisible(true);
    }
    window.addEventListener(REPLAY_TOUR_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, onReplay);
  }, []);

  return (
    <>
      {cardVisible && <OnboardingCard onDismiss={() => setCardVisible(false)} />}
      <OnboardingTourProvider
        steps={CONSULTANT_TOUR_STEPS}
        seenSteps={seenSteps}
        availableStepIds={["consultant_dashboard_summary", "consultant_project_tabs"]}
        replay={replay}
        enabled={!cardVisible}
      >
        {children}
      </OnboardingTourProvider>
    </>
  );
}
