import { useState, useCallback } from 'react';
import { useStateManager } from '@/core/stateManager';
import { BibleRepository } from '@/core/bibleRepository';
import { cn } from '@/lib/utils';
import { Eye, Monitor, SkipForward, Lock, Unlock, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProjectionStatus } from './ProjectionStatus';
import type { Slide } from '@/core/types';

function SlideCard({
  slide,
  label,
  icon: Icon,
  variant,
}: {
  slide: Slide | null;
  label: string;
  icon: React.ElementType;
  variant: 'live' | 'next';
}) {
  const styles = {
    live: {
      base: 'bg-card border border-paprika/30',
      label: 'text-paprika-bright',
      refSize: 'text-xs',
      textSize: 'text-2xl',
      minH: 'min-h-[200px]',
      padding: 'p-6',
      glow: 'animate-glow-pulse',
    },
    next: {
      base: 'bg-card/60 border border-border/70',
      label: 'text-hunter-bright',
      refSize: 'text-xs',
      textSize: 'text-lg',
      minH: 'min-h-[140px]',
      padding: 'p-5',
      glow: '',
    },
  }[variant];

  return (
    <div
      className={cn(
        'rounded-xl border flex flex-col gap-3 transition-all duration-200',
        styles.base,
        styles.minH,
        styles.padding,
        styles.glow,
        variant === 'live' ? 'flex-[57]' : 'flex-[43]'
      )}
    >
      <div className="flex items-center gap-2 shrink-0">
        <Icon className={cn('h-4 w-4', styles.label)} />
        <span className={cn('text-xs font-semibold uppercase tracking-wider', styles.label)}>
          {label}
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-center min-w-0 overflow-hidden">
        {slide ? (
          <>
            <p className={cn('scripture-reference', styles.refSize)}>
              {slide.reference}
            </p>
            <div className="relative flex-1 min-h-0">
              <div className="h-full overflow-y-auto">
                <p
                  className={cn(
                    'scripture-text leading-relaxed whitespace-normal break-words text-snow-soft',
                    styles.textSize
                  )}
                >
                  {slide.text}
                </p>
              </div>
              {/* Scroll boundary fades out instead of slicing a line mid-glyph */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-7 rounded-b-xl bg-gradient-to-t from-card to-transparent"
              />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground/60 text-sm italic">
            {variant === 'live' ? 'No slide projected' : 'No slide selected'}
          </p>
        )}
      </div>
    </div>
  );
}

export function PresenterPanel() {
  const {
    projectionQueue,
    currentSlideIndex,
    liveSlideIndex,
    isScreenBlanked,
    buildQueueFromPassage,
    projectionLocked,
    toggleProjectionLock,
    projectNow,
    currentTranslation,
  } = useStateManager();

  const [jumpValue, setJumpValue] = useState('');
  const [jumpError, setJumpError] = useState('');

  const liveSlide = liveSlideIndex !== null ? projectionQueue[liveSlideIndex] ?? null : null;
  const previewSlide = projectionLocked ? projectionQueue[currentSlideIndex] ?? null : null;

  const handleJump = useCallback(() => {
    const verseNum = jumpValue.trim();
    if (!verseNum || !liveSlide) return;
    const parsed = parseInt(verseNum, 10);
    if (isNaN(parsed) || parsed < 1) { setJumpError('Invalid verse number'); return; }

    const verse = BibleRepository.getVerse(liveSlide.book, liveSlide.chapter, String(parsed), currentTranslation);
    if (!verse) { setJumpError('Verse not found in this chapter'); return; }

    const passage = BibleRepository.getPassage({
      book: liveSlide.book,
      chapter: liveSlide.chapter,
      verseStart: String(parsed),
      translation: currentTranslation,
    });
    if (passage) {
      buildQueueFromPassage(passage);
      setJumpValue('');
      setJumpError('');
    }
  }, [jumpValue, liveSlide, buildQueueFromPassage, currentTranslation]);

  // Next slide is always the one after the live slide
  const displayNext = liveSlideIndex !== null
    ? projectionQueue[liveSlideIndex + 1] ?? null
    : projectionQueue[currentSlideIndex] ?? null;

  if (isScreenBlanked) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Eye className="h-16 w-16 mb-4 opacity-20" />
        <p className="text-xl font-medium">Screen Blanked</p>
        <p className="text-sm mt-2 text-muted-foreground/60">
          Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">B</kbd> to restore projection
        </p>
      </div>
    );
  }

  if (projectionQueue.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-paprika/20">
                <Monitor className="h-3.5 w-3.5 text-paprika-bright" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Presenter</span>
            </div>
            <ProjectionStatus />
          </div>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-3 min-h-0 overflow-y-auto">
          <SlideCard slide={null} label="Live" icon={Monitor} variant="live" />
          <SlideCard slide={null} label="Next" icon={SkipForward} variant="next" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-paprika/20">
              <Monitor className="h-3.5 w-3.5 text-paprika-bright" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Presenter</span>
          </div>
          <ProjectionStatus />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs gap-1 border-hunter/40 text-hunter-bright hover:bg-hunter/10"
            onClick={toggleProjectionLock}
            title={projectionLocked ? 'Unlock projection' : 'Lock projection'}
          >
            {projectionLocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {projectionLocked ? 'Unlock' : 'Lock'}
          </Button>
          {projectionLocked && (
            <Button
              variant="default"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={projectNow}
              title="Project now (P)"
            >
              <Send className="h-3 w-3" />
              Project Now
            </Button>
          )}
          <div className="flex items-center gap-1" data-tutorial="jump">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Verse #"
              value={jumpValue}
              onChange={e => { setJumpValue(e.target.value.replace(/\D/g, '')); setJumpError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleJump(); } }}
              className={cn('h-6 w-16 text-xs text-center bg-card border-border/70 text-snow-soft', jumpError && 'border-destructive')}
              title="Jump to passage"
            />
            {jumpError && <span className="text-[10px] text-destructive whitespace-nowrap">{jumpError}</span>}
          </div>
          <span className="text-xs text-muted-foreground">
            {currentSlideIndex + 1} / {projectionQueue.length}
          </span>
        </div>
      </div>

      <div className="flex-1 p-5 flex flex-col gap-4 min-h-0 overflow-y-auto">
        <SlideCard slide={liveSlide} label="Live" icon={Monitor} variant="live" />
        {projectionLocked && previewSlide && previewSlide !== liveSlide && (
          <div className="rounded-xl border border-border/70 bg-card/60 p-5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview (not projected)</span>
            </div>
            <p className="scripture-reference">{previewSlide.reference}</p>
            <p className="scripture-text leading-relaxed text-scripture">{previewSlide.text}</p>
          </div>
        )}
        <SlideCard slide={displayNext} label="Next" icon={SkipForward} variant="next" />
      </div>
    </div>
  );
}
