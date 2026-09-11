import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const HINT_PREFIX = 'hint_seen_';

export type HintId = 'search' | 'keyboard_nav' | 'service_plan' | 'browse' | 'display_settings';

interface ContextualHintProps {
  id: HintId;
  message: string;
  /** Whether the trigger condition is met */
  show: boolean;
  className?: string;
}

function hasSeenHint(id: HintId): boolean {
  return localStorage.getItem(HINT_PREFIX + id) === 'true';
}

function markHintSeen(id: HintId) {
  localStorage.setItem(HINT_PREFIX + id, 'true');
}

export function clearAllHints() {
  const ids: HintId[] = ['search', 'keyboard_nav', 'service_plan', 'browse', 'display_settings'];
  ids.forEach(id => localStorage.removeItem(HINT_PREFIX + id));
}

export function ContextualHint({ id, message, show, className }: ContextualHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show && !hasSeenHint(id)) {
      setVisible(true);
      markHintSeen(id);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [show, id]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'text-[11px] text-primary/80 bg-card border border-primary/20 rounded-md px-2.5 py-1.5 shadow-[0_1px_2px_hsl(240_20%_8%_/_0.4)]',
        'animate-fade-in',
        className
      )}
    >
      {message}
    </div>
  );
}
