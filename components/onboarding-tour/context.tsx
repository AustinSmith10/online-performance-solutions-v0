"use client";

import { createContext, useContext, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markOnboardingStepSeen } from "@/app/actions/onboarding";
import { TourPanel } from "./TourPanel";
import type { TourStepConfig } from "@/lib/onboarding/steps";

type TourState = { currentId: string | null };
const TourContext = createContext<TourState>({ currentId: null });

// Same-page "replay" clicks dispatch this instead of navigating — a full
// reload just to reset state re-runs the whole page's data fetching.
export const REPLAY_TOUR_EVENT = "onboarding-tour-replay";

// Mirrors the prototype's sessionStorage-persisted stepIndex: survives the
// page reload that the auto-navigate effect below triggers, without
// depending on the "seen" DB write from the previous step having landed.
const KEY_POINTER = "onboarding_tour_pointer";
// Steps skipped this browser session — session-scoped, not persisted to
// the DB. "Skip" means skip-for-now: it shouldn't permanently suppress a
// deferred step that hasn't genuinely been shown yet.
const KEY_DISMISSED = "onboarding_tour_dismissed";

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY_DISMISSED) ?? "[]");
  } catch {
    return [];
  }
}

export function OnboardingTourProvider({
  steps,
  seenSteps,
  availableStepIds,
  replay = false,
  children,
}: {
  steps: TourStepConfig[];
  seenSteps: string[];
  availableStepIds: string[];
  replay?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  function resolve(forceRestart: boolean) {
    const dismissedIds = forceRestart ? [] : readDismissed();
    if (forceRestart) sessionStorage.setItem(KEY_DISMISSED, "[]");
    setDismissed(dismissedIds);

    const pointer = forceRestart ? steps[0]?.id ?? null : sessionStorage.getItem(KEY_POINTER);
    if (pointer) {
      setCurrentId(pointer);
      return;
    }
    // Nothing in progress — first time this step could plausibly show
    // (fresh session, or landed here organically): first step that's
    // actually here, not yet completed, and not skipped this session.
    const candidate = steps.find(
      (s) => availableStepIds.includes(s.id) && !seenSteps.includes(s.id) && !dismissedIds.includes(s.id)
    );
    setCurrentId(candidate?.id ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing tour position to sessionStorage, an external system
    resolve(replay);
    setHydrated(true);

    function onReplayEvent() {
      resolve(true);
    }
    window.addEventListener(REPLAY_TOUR_EVENT, onReplayEvent);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, onReplayEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentStep = currentId ? steps.find((s) => s.id === currentId) ?? null : null;
  const index = currentStep ? steps.findIndex((s) => s.id === currentStep.id) : -1;
  const availableHere = !!currentStep && availableStepIds.includes(currentStep.id);

  // Follow the tour to wherever its current step lives — unconditional,
  // exactly like the prototype's screen-sync effect. Only fires for steps
  // with a known home (path); qa_upload has none since its page is only
  // known dynamically, after the real accept action redirects there.
  useEffect(() => {
    if (!hydrated || !currentStep?.path) return;
    const here = window.location.pathname + window.location.search;
    if (here !== currentStep.path) {
      router.push(currentStep.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentStep?.id]);

  // Safety net the prototype never needed (its fixture data was always
  // present): if we've arrived at a step's home page — or it has no home
  // to travel to — and it turns out not to actually apply here, skip past
  // it rather than stranding the tour with no visible controls.
  useEffect(() => {
    if (!hydrated || !currentStep || availableHere) return;
    const here = window.location.pathname + window.location.search;
    if (currentStep.path && here !== currentStep.path) return; // still travelling there
    const upcoming = steps[index + 1] ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- skipping to the next available step when the current one turns out not to apply here
    setCurrentId(upcoming?.id ?? null);
    if (upcoming) sessionStorage.setItem(KEY_POINTER, upcoming.id);
    else sessionStorage.removeItem(KEY_POINTER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentStep?.id, availableHere]);

  function next() {
    if (!currentStep) return;
    startTransition(() => markOnboardingStepSeen(currentStep.id));
    const upcoming = steps[index + 1] ?? null;
    setCurrentId(upcoming?.id ?? null);
    if (upcoming) sessionStorage.setItem(KEY_POINTER, upcoming.id);
    else sessionStorage.removeItem(KEY_POINTER);
  }

  function skip() {
    if (!currentStep) return;
    const next = [...dismissed, currentStep.id];
    setDismissed(next);
    sessionStorage.setItem(KEY_DISMISSED, JSON.stringify(next));
    sessionStorage.removeItem(KEY_POINTER);
    setCurrentId(null);
  }

  const activeHere = hydrated && availableHere;

  return (
    <TourContext.Provider value={{ currentId: activeHere ? currentStep!.id : null }}>
      {children}
      {activeHere && (
        <TourPanel step={currentStep!} index={index} total={steps.length} onNext={next} onSkip={skip} />
      )}
    </TourContext.Provider>
  );
}

export function useTourTarget(id: string) {
  const { currentId } = useContext(TourContext);
  return currentId === id;
}
