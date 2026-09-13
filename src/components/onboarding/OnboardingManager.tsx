import { useState, useEffect, useCallback } from 'react';
import { safeLocalSet, safeLocalRemove } from '@/core/safeStorage';
import { WelcomeSlides } from './WelcomeSlides';
import { TutorialOverlay } from './TutorialOverlay';
import { clearAllHints } from './ContextualHint';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const STORAGE_KEY = 'bible-projection-onboarded';

type Phase = 'welcome' | 'prompt' | 'tutorial' | 'done';

export function OnboardingManager() {
  const [phase, setPhase] = useState<Phase>('done');

  useEffect(() => {
    const onboarded = localStorage.getItem(STORAGE_KEY);
    if (!onboarded) {
      setPhase('welcome');
    }

    // Listen for restart event
    const handler = () => setPhase('tutorial');
    window.addEventListener('restartTutorial', handler);
    return () => window.removeEventListener('restartTutorial', handler);
  }, []);

  const finishOnboarding = useCallback(() => {
    safeLocalSet(STORAGE_KEY, 'true');
    setPhase('done');
  }, []);

  if (phase === 'welcome') {
    return <WelcomeSlides onComplete={() => setPhase('prompt')} />;
  }

  if (phase === 'prompt') {
    return (
      <Dialog open onOpenChange={() => finishOnboarding()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Quick Tutorial?</DialogTitle>
            <DialogDescription>
              Would you like a guided tour of the interface? It only takes a moment.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <button
              onClick={finishOnboarding}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
            <button
              onClick={() => setPhase('tutorial')}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-[0_4px_10px_-2px_hsl(32_94%_58%_/_0.5)] hover:bg-primary/95 active:scale-[0.98] transition-all"
            >
              Start Tutorial
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (phase === 'tutorial') {
    return <TutorialOverlay onComplete={finishOnboarding} />;
  }

  return null;
}

/** Call this to restart the tutorial */
export function restartTutorial() {
  window.dispatchEvent(new CustomEvent('restartTutorial'));
}

/** Call this to reset all onboarding and hints */
export function resetOnboarding() {
  safeLocalRemove(STORAGE_KEY);
  clearAllHints();
  window.location.reload();
}
