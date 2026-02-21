import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'sigscore_tour_completed';
const TOUR_VERSION = '1'; // Bump to re-show tour after major UI changes

export interface TourStep {
  id: string;
  title: string;
  description: string;
  /** CSS selector or data-tour attribute value to highlight */
  target: string;
  /** Position of tooltip relative to target */
  placement: 'top' | 'bottom' | 'left' | 'right';
  /** Label for the primary action button */
  action: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Sigscore',
    description:
      'Sigscore aggregates 16 signal sources — GitHub, npm, PyPI, Segment, and more — to show you which companies are evaluating your tool before they fill out a form. Let us show you around.',
    target: '[data-tour="dashboard-title"]',
    placement: 'bottom',
    action: 'Next',
  },
  {
    id: 'dashboard',
    title: 'Your Dashboard',
    description:
      'This is your command center. See daily signal volume, hot accounts, pipeline value, and activity trends at a glance.',
    target: '[data-tour="stat-cards"]',
    placement: 'bottom',
    action: 'Next',
  },
  {
    id: 'connect-source',
    title: 'Connect a Source',
    description:
      'Head to Integrations to connect GitHub, npm, Segment, Slack, and 10+ other signal sources. Signals start flowing in minutes.',
    target: '[data-tour="nav-integrations"]',
    placement: 'right',
    action: 'Next',
  },
  {
    id: 'signals',
    title: 'View Signals',
    description:
      'Every star, fork, issue, download, and page view is captured as a signal. Browse them in the Signals feed or see them on company profiles.',
    target: '[data-tour="nav-signals"]',
    placement: 'right',
    action: 'Next',
  },
  {
    id: 'scores',
    title: 'Score Accounts',
    description:
      'Sigscore automatically scores every company with a PQA (Product-Qualified Account) score. Hot accounts surface to the top so your team knows who to reach out to.',
    target: '[data-tour="nav-scores"]',
    placement: 'right',
    action: 'Next',
  },
  {
    id: 'workflows',
    title: 'Set Up Workflows',
    description:
      'Automate actions when signals arrive. Send Slack alerts, create deals, enrich contacts, or trigger webhooks -- all without code.',
    target: '[data-tour="nav-workflows"]',
    placement: 'right',
    action: 'Got it!',
  },
];

export interface UseProductTourReturn {
  /** Whether the tour overlay is currently visible */
  isTourActive: boolean;
  /** Current step index (0-based) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** The current step definition */
  step: TourStep | null;
  /** Advance to the next step, or complete the tour if on the last step */
  nextStep: () => void;
  /** Go back to the previous step */
  prevStep: () => void;
  /** Skip/dismiss the tour and mark it completed */
  skipTour: () => void;
  /** Manually start (or restart) the tour */
  startTour: () => void;
  /** Whether the tour has been completed before */
  hasCompletedTour: boolean;
}

function isTourCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === TOUR_VERSION;
  } catch {
    return false;
  }
}

function markTourCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, TOUR_VERSION);
  } catch {
    // localStorage unavailable -- silently ignore
  }
}

function clearTourCompleted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}

export function useProductTour(): UseProductTourReturn {
  const [hasCompletedTour, setHasCompletedTour] = useState(isTourCompleted);
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Auto-start the tour for new users (not completed yet)
  // We use a small delay so the dashboard has time to render its elements
  useEffect(() => {
    if (!hasCompletedTour) {
      const timer = setTimeout(() => {
        setIsTourActive(true);
        setCurrentStep(0);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour]);

  const nextStep = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Last step -- complete the tour
      markTourCompleted();
      setHasCompletedTour(true);
      setIsTourActive(false);
      setCurrentStep(0);
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const skipTour = useCallback(() => {
    markTourCompleted();
    setHasCompletedTour(true);
    setIsTourActive(false);
    setCurrentStep(0);
  }, []);

  const startTour = useCallback(() => {
    clearTourCompleted();
    setHasCompletedTour(false);
    setCurrentStep(0);
    setIsTourActive(true);
  }, []);

  return {
    isTourActive,
    currentStep,
    totalSteps: TOUR_STEPS.length,
    step: isTourActive ? TOUR_STEPS[currentStep] ?? null : null,
    nextStep,
    prevStep,
    skipTour,
    startTour,
    hasCompletedTour,
  };
}
