import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { TourStep } from '../lib/useProductTour';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductTourProps {
  /** Whether the tour is active */
  active: boolean;
  /** Current step definition */
  step: TourStep | null;
  /** 0-based step index */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Advance to next step */
  onNext: () => void;
  /** Go back one step */
  onPrev: () => void;
  /** Skip/dismiss the tour */
  onSkip: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PADDING = 12;
const TOOLTIP_GAP = 16;

function getTargetElement(selector: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function getElementRect(el: HTMLElement): SpotlightRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };
}

/**
 * Compute tooltip position based on the spotlight rect and desired placement.
 * Falls back to centering if the target isn't found.
 */
function computeTooltipStyle(
  spotlight: SpotlightRect | null,
  placement: TourStep['placement'],
  tooltipWidth: number,
  tooltipHeight: number,
): React.CSSProperties {
  // No target found -- center the tooltip on screen
  if (!spotlight) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let top = 0;
  let left = 0;

  switch (placement) {
    case 'bottom':
      top = spotlight.top + spotlight.height + TOOLTIP_GAP;
      left = spotlight.left + spotlight.width / 2 - tooltipWidth / 2;
      break;
    case 'top':
      top = spotlight.top - tooltipHeight - TOOLTIP_GAP;
      left = spotlight.left + spotlight.width / 2 - tooltipWidth / 2;
      break;
    case 'right':
      top = spotlight.top + spotlight.height / 2 - tooltipHeight / 2;
      left = spotlight.left + spotlight.width + TOOLTIP_GAP;
      break;
    case 'left':
      top = spotlight.top + spotlight.height / 2 - tooltipHeight / 2;
      left = spotlight.left - tooltipWidth - TOOLTIP_GAP;
      break;
  }

  // Clamp to viewport boundaries with margin
  const margin = 16;
  left = Math.max(margin, Math.min(left, viewportW - tooltipWidth - margin));
  top = Math.max(margin, Math.min(top, viewportH - tooltipHeight - margin));

  return { top, left };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProductTour({
  active,
  step,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: ProductTourProps) {
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ w: 380, h: 240 });
  const [isAnimating, setIsAnimating] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Measure and position the spotlight whenever the step changes
  const updatePosition = useCallback(() => {
    if (!step) {
      setSpotlight(null);
      return;
    }

    const el = getTargetElement(step.target);
    if (el) {
      // Scroll the element into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

      // Small delay for scroll to settle
      requestAnimationFrame(() => {
        setSpotlight(getElementRect(el));
      });
    } else {
      setSpotlight(null);
    }
  }, [step]);

  useEffect(() => {
    if (!active || !step) return;

    setIsAnimating(true);
    const animTimer = setTimeout(() => setIsAnimating(false), 300);

    // Delay to allow DOM to paint
    const posTimer = setTimeout(updatePosition, 100);

    return () => {
      clearTimeout(animTimer);
      clearTimeout(posTimer);
    };
  }, [active, step, updatePosition]);

  // Re-calculate on resize
  useEffect(() => {
    if (!active) return;

    const handleResize = () => updatePosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, updatePosition]);

  // Measure tooltip after render
  useEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      setTooltipSize({ w: rect.width, h: rect.height });
    }
  }, [step, active]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        onNext();
      } else if (e.key === 'ArrowLeft' && currentStep > 0) {
        onPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onSkip, onNext, onPrev, currentStep]);

  if (!active || !step) return null;

  const tooltipStyle = computeTooltipStyle(
    spotlight,
    step.placement,
    tooltipSize.w,
    tooltipSize.h,
  );

  const isFirst = currentStep === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      style={{ pointerEvents: 'auto' }}
      aria-modal="true"
      role="dialog"
      aria-label={`Product tour step ${currentStep + 1} of ${totalSteps}: ${step.title}`}
    >
      {/* Dark overlay with spotlight cutout using CSS box-shadow */}
      <div
        className="absolute inset-0 transition-all duration-300 ease-in-out"
        onClick={onSkip}
        style={
          spotlight
            ? {
                // Use a massive box-shadow to create the overlay,
                // leaving a transparent "hole" for the spotlight
                background: 'transparent',
                boxShadow: `
                  0 0 0 9999px rgba(0, 0, 0, 0.65),
                  0 0 32px 4px rgba(0, 0, 0, 0.3) inset
                `,
                position: 'absolute',
                top: spotlight.top,
                left: spotlight.left,
                width: spotlight.width,
                height: spotlight.height,
                borderRadius: '12px',
                pointerEvents: 'none',
              }
            : {
                background: 'rgba(0, 0, 0, 0.65)',
              }
        }
      />

      {/* Spotlight ring glow effect */}
      {spotlight && (
        <div
          className="absolute pointer-events-none transition-all duration-300 ease-in-out"
          style={{
            top: spotlight.top - 2,
            left: spotlight.left - 2,
            width: spotlight.width + 4,
            height: spotlight.height + 4,
            borderRadius: '14px',
            border: '2px solid rgba(99, 102, 241, 0.5)',
            boxShadow: '0 0 20px 4px rgba(99, 102, 241, 0.2)',
          }}
        />
      )}

      {/* Click-through blocker for everything outside the spotlight */}
      <div
        className="absolute inset-0"
        onClick={(e) => {
          e.stopPropagation();
          // Don't close on clicking the overlay itself -- only on Skip
        }}
        style={{ pointerEvents: 'auto', background: 'transparent' }}
      />

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className={`absolute z-[10000] w-[380px] max-w-[calc(100vw-32px)] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl transition-all duration-300 ease-in-out ${
          isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        style={{ ...tooltipStyle, pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step indicator badge */}
        <div className="px-5 pt-4 pb-0 flex items-center justify-between">
          <span className="text-xs font-medium text-indigo-400">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <button
            onClick={onSkip}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Skip tour"
          >
            Skip tour
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pt-3 pb-2">
          <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
          <p className="text-sm text-gray-300 leading-relaxed">{step.description}</p>
        </div>

        {/* Progress dots + navigation buttons */}
        <div className="px-5 pt-3 pb-4 flex items-center justify-between">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === currentStep
                    ? 'w-4 bg-indigo-500'
                    : i < currentStep
                      ? 'w-1.5 bg-indigo-400/60'
                      : 'w-1.5 bg-gray-600'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={onPrev}
                className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
              >
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              autoFocus
            >
              {step.action}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
