import { cn } from '@/lib/utils';
import type { Passage } from '@/core/types';
import { Eye, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PreviewPanelProps {
  passage: Passage | null;
  onCommit: () => void;
  hasCommitted: boolean;
  isScreenBlanked?: boolean;
}

export function PreviewPanel({ passage, onCommit, hasCommitted, isScreenBlanked }: PreviewPanelProps) {
  if (isScreenBlanked) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Eye className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-center text-lg font-medium">Screen Blanked</p>
        <p className="text-sm mt-2 text-muted-foreground/70">
          Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Enter</kbd> to commit a verse and restore projection
        </p>
      </div>
    );
  }

  if (!passage) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Eye className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-center">
          Search for a passage to preview it here
        </p>
        <p className="text-sm mt-2 text-muted-foreground/70">
          Type a reference like "John 3:16" or search by keyword
        </p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-preview/20">
            <Eye className="h-4 w-4 text-preview" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">Preview</span>
        </div>
        <span className="scripture-reference text-reference">
          {passage.displayReference}
        </span>
      </div>
      
      {/* Scripture Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <blockquote className="scripture-text text-2xl leading-relaxed text-scripture">
          {passage.verses.map((verse, index) => (
            <span key={verse.verse}>
              <sup className="text-sm text-muted-foreground mr-1">{verse.verse}</sup>
              {verse.text}
              {index < passage.verses.length - 1 && ' '}
            </span>
          ))}
        </blockquote>
      </div>
      
      {/* Actions */}
      <div className="p-4 border-t border-border bg-card/50">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Enter</kbd> to commit to projection
          </p>
          <Button
            onClick={onCommit}
            className="gap-2"
            variant={hasCommitted ? "secondary" : "default"}
          >
            <Send className="h-4 w-4" />
            Commit to Projection
          </Button>
        </div>
      </div>
    </div>
  );
}
