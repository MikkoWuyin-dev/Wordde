import { useCallback, useState } from 'react';
import { useStateManager } from '@/core/stateManager';
import { BibleRepository } from '@/core/bibleRepository';
import { cn } from '@/lib/utils';
import { Clock, Play, Trash2, X } from 'lucide-react';

export function RecentPassages() {
  const { recentPassages, projectionQueue, buildQueueFromPassage, buildQueueFromChapter, removeFromRecent, clearAllRecent, currentTranslation } = useStateManager();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const loadRecent = useCallback((reference: string) => {
    const rangePattern = /^(.+?)\s+(\d+):(\d+)(?:\s*[-–]\s*(\d+))?$/i;
    const chapterPattern = /^(.+?)\s+(\d+)$/i;

    const rangeMatch = reference.match(rangePattern);
    if (rangeMatch) {
      const [, bookPart, chapter, verseStart, verseEnd] = rangeMatch;
      const bookName = BibleRepository.resolveBookName(bookPart.trim());
      if (!bookName) return;
      const passage = BibleRepository.getPassage({ book: bookName, chapter, verseStart, verseEnd, translation: currentTranslation });
      if (passage) buildQueueFromPassage(passage);
      return;
    }

    const chapterMatch = reference.match(chapterPattern);
    if (chapterMatch) {
      const [, bookPart, chapter] = chapterMatch;
      const bookName = BibleRepository.resolveBookName(bookPart.trim());
      if (!bookName) return;
      buildQueueFromChapter(bookName, chapter);
    }
  }, [buildQueueFromPassage, buildQueueFromChapter, currentTranslation]);

  const isActive = useCallback((reference: string) => {
    if (!projectionQueue.length) return false;
    const first = projectionQueue[0];
    return reference.startsWith(`${first.book} ${first.chapter}`);
  }, [projectionQueue]);

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
      <div className="space-y-0.5">
        {recentPassages.slice(0, 8).map((ref, idx) => {
          const active = isActive(ref);
          const isConfirming = confirmDelete === ref;

          if (isConfirming) {
            return (
              <div
                key={`${ref}-${idx}`}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-destructive/10 border border-destructive/30"
              >
                <span className="text-xs text-foreground truncate">Remove?</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { removeFromRecent(ref); setConfirmDelete(null); }}
                    className="text-[10px] text-destructive hover:text-destructive/80 font-medium px-1.5 py-0.5 rounded hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent"
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
                'group w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                active
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-accent border border-transparent'
              )}
            >
              <button
                onClick={() => loadRecent(ref)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                {active ? (
                  <Play className="h-3 w-3 text-primary fill-primary shrink-0" />
                ) : (
                  <span className="text-[10px] text-muted-foreground font-mono w-3 text-center shrink-0">{idx + 1}</span>
                )}
                <span className={cn('text-xs truncate', active ? 'font-medium text-primary' : 'text-foreground')}>
                  {ref}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(ref); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 p-0.5 rounded hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
