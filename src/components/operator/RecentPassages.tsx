import { useCallback, useEffect, useState } from 'react';
import { useStateManager, MAX_RECENT_PASSAGES } from '@/core/stateManager';
import { BibleRepository } from '@/core/bibleRepository';
import { cn } from '@/lib/utils';
import { Clock, Play, Trash2, X } from 'lucide-react';

export function RecentPassages() {
  const {
    recentPassages,
    buildQueueFromPassage,
    buildQueueFromChapter,
    removeFromRecent,
    clearAllRecent,
    currentTranslation,
    liveSlideIndex,
    projectionQueue,
  } = useStateManager();

  // RecentPassages runs before the rest of the app has fully wired these
  // slice states. If it receives undefined at mount / hot reload, fall back
  // to safe local defaults so the Recent tab can render without throwing.
  const safeQueue = Array.isArray(projectionQueue) ? projectionQueue : [];
  const safeLiveIndex = typeof liveSlideIndex === 'number' ? liveSlideIndex : null;
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  // Visible failure state for a recent that cannot be re-opened. Auto-clears;
  // the entry itself is never removed implicitly — deletion stays explicit.
  const [loadError, setLoadError] = useState<{ ref: string; message: string } | null>(null);

  useEffect(() => {
    if (!loadError) return;
    const timer = setTimeout(() => setLoadError(null), 3000);
    return () => clearTimeout(timer);
  }, [loadError]);

  const loadRecent = useCallback((reference: string) => {
    // Reference grammar mirrors what the core stores on every slide:
    // "<book> <chapter>:<verse key>", where the verse key is the VERBATIM
    // source token — numeric ("16") or lettered ("3a"). Verse keys are
    // matched by key in the repository, never re-derived here (VF-003:
    // no verse arithmetic, no integer-only assumptions).
    const REF_PATTERN = /^(.+?)\s+(\d+):(\S+?)(?:\s*[-–]\s*(\S+))?$/i;
    const CHAPTER_PATTERN = /^(.+?)\s+(\d+)$/i;

    const fail = (message: string) => setLoadError({ ref: reference, message });

    const rangeMatch = reference.match(REF_PATTERN);
    if (rangeMatch) {
      const [, bookPart, chapter, verseStart, verseEnd] = rangeMatch;
      const bookNames = BibleRepository.resolveBookName(bookPart.trim());
      if (bookNames.length === 0) {
        fail(`"${bookPart.trim()}" is not a recognized book`);
        return;
      }
      const passage = BibleRepository.getPassage({ book: bookNames[0], chapter, verseStart, verseEnd, translation: currentTranslation });
      if (!passage) {
        // Fail visibly, per UX constraints — most often the entry was
        // captured under a different translation whose verse keys differ.
        fail(`not found in ${currentTranslation} — try switching translation`);
        return;
      }
      setLoadError(null);
      buildQueueFromPassage(passage);
      return;
    }

    const chapterMatch = reference.match(CHAPTER_PATTERN);
    if (chapterMatch) {
      const [, bookPart, chapter] = chapterMatch;
      const bookNames = BibleRepository.resolveBookName(bookPart.trim());
      if (bookNames.length === 0) {
        fail(`"${bookPart.trim()}" is not a recognized book`);
        return;
      }
      setLoadError(null);
      buildQueueFromChapter(bookNames[0], chapter);
      return;
    }

    fail('unrecognized reference format');
  }, [buildQueueFromPassage, buildQueueFromChapter, currentTranslation]);

  const getCurrentReference = useCallback((): string | null => {
    // Highlight ONLY the slide that is actually on air. When nothing is
    // committed (liveSlideIndex null or out of range) nothing is lit — a
    // preview or mid-edit queue must never read as LIVE, or the operator
    // is silently misled about what the congregation sees.
    if (safeLiveIndex == null || safeLiveIndex < 0 || safeLiveIndex >= safeQueue.length) {
      return null;
    }
    return safeQueue[safeLiveIndex].reference;
  }, [safeLiveIndex, safeQueue]);

  const isActive = useCallback((reference: string) => {
    const current = getCurrentReference();
    if (!current) return false;
    return reference === current;
  }, [getCurrentReference]);

  if (recentPassages.length === 0) {
    return (
      <div className="px-2 pb-2">
        <div className="flex items-center gap-1.5 px-1 py-1.5">
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recent</span>
        </div>
        <p className="text-xs text-muted-foreground px-2 py-2">No recent passages yet</p>
      </div>
    );
  }

  return (
    <div className="px-2 pb-2">
      <div className="flex items-center justify-between px-1 py-1.5">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recent</span>
        </div>
        {confirmClearAll ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Clear all?</span>
            <button
              onClick={() => { clearAllRecent(); setConfirmClearAll(false); }}
              className="text-[10px] text-destructive hover:text-destructive/80 font-medium px-1"
            >
              Clear
            </button>
            <button
              onClick={() => setConfirmClearAll(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClearAll(true)}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
          >
            Clear All
          </button>
        )}
      </div>
      {loadError && (
        <div className="mx-1 mb-1 px-2 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30" role="status">
          <p className="text-[10px] text-destructive leading-snug">
            Couldn't open {loadError.ref}: {loadError.message}
          </p>
        </div>
      )}
      <div className="space-y-0.5">
        {recentPassages.slice(0, MAX_RECENT_PASSAGES).map((ref, idx) => {
          const active = isActive(ref);
          const isConfirming = confirmDelete === ref;

          if (isConfirming) {
            return (
              <div
                key={`${ref}-${idx}`}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-destructive/8 border border-destructive/30"
              >
                <span className="text-xs text-foreground truncate">Remove?</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { removeFromRecent(ref); setConfirmDelete(null); }}
                    className="text-[10px] text-destructive hover:text-destructive/90 font-medium px-1.5 py-0.5 rounded hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-secondary/60"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={`${ref}-${idx}`}
              className={cn(
                'group focus-console w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all',
                active
                  ? 'bg-paprika/12 border border-paprika/30 shadow-sm'
                  : 'border-transparent hover:bg-secondary/60'
              )}
            >
              <button
                onClick={() => loadRecent(ref)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                {active ? (
                  <Play className="h-3 w-3 text-paprika fill-paprika shrink-0" />
                ) : (
                  <span className="text-[10px] text-muted-foreground font-mono w-3 text-center shrink-0">{idx + 1}</span>
                )}
                <span className={cn('text-xs truncate', active ? 'font-medium text-paprika' : 'text-foreground')}>
                  {ref}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(ref); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 p-0.5 rounded hover:bg-destructive/10"
              >                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
