import { useStateManager } from '@/core/stateManager';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export function PassageNavigation() {
  const {
    committedPassage,
    goToNextVerse,
    goToPreviousVerse,
    goToNextChapter,
    goToPreviousChapter,
  } = useStateManager();

  if (!committedPassage) return null;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={goToPreviousChapter}
        title="Previous chapter"
        className="text-muted-foreground hover:text-foreground"
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={goToPreviousVerse}
        title="Previous verse (←)"
        className="text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="px-2 text-sm font-medium text-foreground min-w-[140px] text-center">
        {committedPassage.displayReference}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={goToNextVerse}
        title="Next verse (→)"
        className="text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={goToNextChapter}
        title="Next chapter"
        className="text-muted-foreground hover:text-foreground"
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
