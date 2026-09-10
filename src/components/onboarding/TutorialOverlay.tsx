import { useState, useEffect, useCallback, useRef } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStateManager } from '@/core/stateManager';

interface TutorialStep {
  targetSelector: string;
  title: string;
  instruction: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  actionType: 'auto' | 'search' | 'navigate' | 'jump' | 'service-click' | 'key-b';
  completedText?: string;
}

const STEPS: TutorialStep[] = [
  {
    targetSelector: '[data-tutorial="search"]',
    title: 'Search for Scripture',
    instruction: 'Type a Bible verse (e.g., John 3:16) in the search box and select a result.',
    position: 'right',
    actionType: 'search',
    completedText: 'Verse projected!',
  },
  {
    targetSelector: '[data-tutorial="presenter"]',
    title: 'Live Projection',
    instruction: 'This verse is now projected live. The Presenter panel shows what\'s on screen.',
    position: 'left',
    actionType: 'auto',
  },
  {
    targetSelector: '[data-tutorial="presenter"]',
    title: 'Navigate Verses',
    instruction: 'Use the ← → arrow keys to move between verses.',
    position: 'left',
    actionType: 'navigate',
    completedText: 'Navigation works!',
  },
  {
    targetSelector: '[data-tutorial="jump"]',
    title: 'Jump to Verse',
    instruction: 'Type a verse number (e.g., 5) in the input and press Enter.',
    position: 'left',
    actionType: 'jump',
    completedText: 'Jumped to verse!',
  },
  {
    targetSelector: '[data-tutorial="service"]',
    title: 'Service Plan',
    instruction: 'Click a saved passage to load it. Create a service plan for your worship lineup.',
    position: 'right',
    actionType: 'service-click',
    completedText: 'Service Plan ready!',
  },
  {
    targetSelector: '[data-tutorial="presenter"]',
    title: 'Blank Screen',
    instruction: 'Press B to blank/unblank the projection screen.',
    position: 'left',
    actionType: 'key-b',
    completedText: 'Screen toggled!',
  },
  {
    targetSelector: '[data-tutorial="presenter"]',
    title: 'You\'re Ready!',
    instruction: 'You know the essentials. Use keyboard shortcuts for fast, seamless control during services.',
    position: 'left',
    actionType: 'auto',
  },
];

const TOOLTIP_MARGIN = 12;
const TOOLTIP_WIDTH = 288; // max-w-xs ≈ 20rem = 320px, but content is ~288px
const TOOLTIP_HEIGHT_EST = 160; // estimated max tooltip height

/**
 * Clamp tooltip position so it stays fully within the viewport.
 * Returns { top, left } in px for fixed positioning.
 */
function clampTooltip(
  rect: DOMRect,
  preferredPosition: 'top' | 'bottom' | 'left' | 'right',
  viewportW: number,
  viewportH: number
): { top: number; left: number } {
  let top: number;
  let left: number;

  // Try preferred position first
  if (preferredPosition === 'right') {
    top = rect.top;
    left = rect.right + TOOLTIP_MARGIN;
  } else if (preferredPosition === 'left') {
    top = rect.top;
    left = rect.left - TOOLTIP_WIDTH - TOOLTIP_MARGIN;
  } else if (preferredPosition === 'bottom') {
    top = rect.bottom + TOOLTIP_MARGIN;
    left = rect.left;
  } else {
    top = rect.top - TOOLTIP_HEIGHT_EST - TOOLTIP_MARGIN;
    left = rect.left;
  }

  // Clamp horizontal
  if (left + TOOLTIP_WIDTH > viewportW - TOOLTIP_MARGIN) {
    left = viewportW - TOOLTIP_WIDTH - TOOLTIP_MARGIN;
  }
  if (left < TOOLTIP_MARGIN) {
    left = TOOLTIP_MARGIN;
  }

  // Clamp vertical
  if (top + TOOLTIP_HEIGHT_EST > viewportH - TOOLTIP_MARGIN) {
    top = viewportH - TOOLTIP_HEIGHT_EST - TOOLTIP_MARGIN;
  }
  if (top < TOOLTIP_MARGIN) {
    top = TOOLTIP_MARGIN;
  }

  return { top, left };
}

interface TutorialOverlayProps {
  onComplete: () => void;
}

export function TutorialOverlay({ onComplete }: TutorialOverlayProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [actionDone, setActionDone] = useState(false);
  const prevSlideIndexRef = useRef<number | null>(null);

  const currentStep = STEPS[step];
  const { committedPassage, currentSlideIndex, isScreenBlanked } = useStateManager();

  // Measure + scroll target into view
  const measureTarget = useCallback(() => {
    if (!currentStep) return;
    const el = document.querySelector(currentStep.targetSelector);
    if (!el) return;

    // Scroll into view if not visible
    const elRect = el.getBoundingClientRect();
    const inView =
      elRect.top >= 0 &&
      elRect.left >= 0 &&
      elRect.bottom <= window.innerHeight &&
      elRect.right <= window.innerWidth;

    if (!inView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      // Re-measure after scroll settles
      requestAnimationFrame(() => {
        setRect(el.getBoundingClientRect());
      });
    } else {
      setRect(elRect);
    }
  }, [currentStep]);

  useEffect(() => {
    measureTarget();
    const id = setInterval(measureTarget, 500);
    window.addEventListener('resize', measureTarget);
    return () => { clearInterval(id); window.removeEventListener('resize', measureTarget); };
  }, [measureTarget]);

  // Reset action state on step change
  useEffect(() => {
    setActionDone(false);
    prevSlideIndexRef.current = currentSlideIndex;
  }, [step]);

  // Action detection for each step type
  useEffect(() => {
    if (!currentStep || actionDone) return;

    if (currentStep.actionType === 'auto') {
      const timer = setTimeout(() => setActionDone(true), 1500);
      return () => clearTimeout(timer);
    }

    if (currentStep.actionType === 'search') {
      if (committedPassage) setActionDone(true);
      return;
    }

    if (currentStep.actionType === 'navigate') {
      if (prevSlideIndexRef.current !== null && currentSlideIndex !== prevSlideIndexRef.current) {
        setActionDone(true);
      }
      return;
    }

    if (currentStep.actionType === 'jump') {
      if (prevSlideIndexRef.current !== null && currentSlideIndex !== prevSlideIndexRef.current) {
        setActionDone(true);
      }
      return;
    }

    if (currentStep.actionType === 'service-click') {
      const initialPassage = committedPassage?.displayReference;
      const unsub = useStateManager.subscribe((state) => {
        if (state.committedPassage && state.committedPassage.displayReference !== initialPassage) {
          setActionDone(true);
        }
      });
      return unsub;
    }

    if (currentStep.actionType === 'key-b') {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'b' || e.key === 'B') setActionDone(true);
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [currentStep, actionDone, committedPassage, currentSlideIndex, isScreenBlanked]);

  // Auto-advance after action completion
  useEffect(() => {
    if (actionDone) {
      const timer = setTimeout(() => {
        if (step < STEPS.length - 1) {
          setStep(step + 1);
        }
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [actionDone, step]);

  const advance = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  if (!currentStep || !rect) return null;

  const padding = 8;
  const highlightStyle = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  const tooltipPos = clampTooltip(rect, currentStep.position, window.innerWidth, window.innerHeight);

  const isLastStep = step === STEPS.length - 1;
  const isActionStep = currentStep.actionType !== 'auto';

  return (
    <div className="fixed inset-0 z-[90]" style={{ pointerEvents: 'none' }}>
      {/* Backdrop with cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="tutorial-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={highlightStyle.left}
              y={highlightStyle.top}
              width={highlightStyle.width}
              height={highlightStyle.height}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="hsl(222 47% 11% / 0.6)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Highlight ring */}
      <div
        className="absolute border-2 border-primary rounded-lg pointer-events-none transition-all duration-300"
        style={{
          ...highlightStyle,
          boxShadow: '0 0 0 4px hsl(var(--primary) / 0.2)',
        }}
      />

      {/* Tooltip — fixed, viewport-clamped */}
      <div
        className="fixed max-w-xs bg-card border border-border rounded-xl p-4 shadow-xl"
        style={{ top: tooltipPos.top, left: tooltipPos.left, pointerEvents: 'auto' }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-foreground">{currentStep.title}</h3>
          <button onClick={onComplete} className="text-muted-foreground hover:text-foreground shrink-0" title="Skip tutorial">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{currentStep.instruction}</p>

        {/* Action feedback */}
        {actionDone && currentStep.completedText && (
          <div className="flex items-center gap-1.5 mb-3 text-xs text-primary font-medium animate-in fade-in duration-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{currentStep.completedText}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {step + 1} / {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {isActionStep && !actionDone && !isLastStep && (
              <button
                onClick={advance}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip step
              </button>
            )}
            {(currentStep.actionType === 'auto' || actionDone || isLastStep) && (
              <button
                onClick={advance}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                {isLastStep ? 'Finish' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fixed escape button — always accessible regardless of scroll */}
      <button
        onClick={onComplete}
        className="fixed top-3 right-3 flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-card/90 border border-border text-xs text-muted-foreground hover:text-foreground backdrop-blur-sm transition-colors"
        style={{ pointerEvents: 'auto', zIndex: 91 }}
      >
        <X className="h-3 w-3" />
        Exit Tutorial
      </button>
    </div>
  );
}
