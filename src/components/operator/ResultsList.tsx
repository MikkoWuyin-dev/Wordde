import { cn } from '@/lib/utils';
import type { SearchResult } from '@/core/types';
import { Book, Hash, Search, Sparkles } from 'lucide-react';

interface ResultsListProps {
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const matchTypeIcons = {
  exact: Book,
  reference: Hash,
  keyword: Search,
  semantic: Sparkles,
};

const matchTypeLabels = {
  exact: 'Exact',
  reference: 'Reference',
  keyword: 'Keyword',
  semantic: 'Topic',
};

export function ResultsList({ results, selectedIndex, onSelect }: ResultsListProps) {
  if (results.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground px-2 py-1">
        Results ({results.length})
      </div>
      <div className="space-y-1">
        {results.map((result, index) => {
          const Icon = matchTypeIcons[result.matchType];
          const isSelected = index === selectedIndex;
          
          return (
            <button
              key={`${result.passage.displayReference}-${index}`}
              onClick={() => onSelect(index)}
              className={cn(
                "w-full text-left p-3 rounded-md transition-all duration-150",
                "result-item",
                isSelected 
                  ? "bg-secondary border-l-4 border-l-primary" 
                  : "hover:bg-muted/50 border-l-4 border-l-transparent"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-1.5 rounded",
                  isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-semibold",
                      isSelected ? "text-primary" : "text-foreground"
                    )}>
                      {result.passage.displayReference}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {matchTypeLabels[result.matchType]}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1 font-scripture">
                    {result.passage.text}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
