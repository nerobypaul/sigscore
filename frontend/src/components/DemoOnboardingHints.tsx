import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const STORAGE_KEY = 'devsignal-demo-tour-seen';

interface TourStep {
  title: string;
  body: string;
  /** data-tour attribute value to highlight in the sidebar */
  highlight?: string;
  /** Show a CTA button instead of "Next" */
  cta?: { label: string; to: string };
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to DevSignal',
    body: "You're exploring with realistic demo data. 8 companies, 600 signals, AI briefs \u2014 all interactive.",
  },
  {
    title: 'Signal Feed',
    body: 'This is your live signal stream. Every GitHub star, npm download, and community mention feeds here automatically.',
    highlight: 'nav-signals',
  },
  {
    title: 'PQA Scores',
    body: 'Accounts scored 0\u2013100 based on developer activity. HOT accounts are ready to buy.',
    highlight: 'nav-scores',
  },
  {
    title: 'Ready to try it with your data?',
    body: 'Connect GitHub in 2 minutes and see your real accounts.',
    cta: { label: 'Create free account', to: '/register' },
  },
];

export default function DemoOnboardingHints() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  const isDemo = user?.organizations?.some(
    (uo) => uo.organization?.name === 'DevSignal Demo',
  );

  useEffect(() => {
    if (isDemo && !sessionStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, [isDemo]);

  // Manage highlight ring on the target sidebar element
  useEffect(() => {
    if (!visible) return;
    const target = STEPS[step].highlight;
    if (!target) return;

    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) return;

    el.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-gray-900', 'rounded-lg');
    return () => {
      el.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-gray-900', 'rounded-lg');
    };
  }, [step, visible]);

  const dismiss = useCallback(() => {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
    // Clean up any lingering highlight
    document.querySelectorAll('[data-tour]').forEach((el) => {
      el.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-gray-900', 'rounded-lg');
    });
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-1">
          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">
            Step {step + 1} of {STEPS.length}
          </p>
          <h3 className="text-base font-semibold text-gray-900">{current.title}</h3>
        </div>

        {/* Body */}
        <div className="px-5 pb-4">
          <p className="text-sm text-gray-600 leading-relaxed mt-1">{current.body}</p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex items-center justify-between">
          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                  i === step ? 'bg-indigo-600' : i < step ? 'bg-indigo-300' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={dismiss}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip
            </button>
            {current.cta ? (
              <Link
                to={current.cta.to}
                onClick={() => {
                  dismiss();
                  localStorage.removeItem('accessToken');
                  localStorage.removeItem('refreshToken');
                  localStorage.removeItem('organizationId');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {current.cta.label}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            ) : (
              <button
                onClick={next}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {isLast ? 'Done' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
