import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X, Book, BookOpen, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getSuggestions, type Suggestion } from '@/core/autocomplete';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onClear: () => void;
  onSelectSuggestion?: (reference: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  onFocus?: () => void;
}

const typeIcons = {
  book: Book,
  chapter: BookOpen,
  verse: FileText,
};

export function SearchInput({
  value,
  onChange,
  onKeyDown,
  onClear,
  onSelectSuggestion,
  isLoading = false,
  placeholder = 'Search by reference or keyword... (e.g., John 3:16)',
  onFocus: onFocusProp,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update suggestions when value changes
  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const results = getSuggestions(value);
    setSuggestions(results);
    setSelectedSuggestion(-1);
    setShowSuggestions(results.length > 0);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectSuggestion = useCallback((suggestion: Suggestion) => {
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion.reference);
    } else {
      onChange(suggestion.reference);
    }
  }, [onChange, onSelectSuggestion]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setSelectedSuggestion(prev =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          return;

        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setSelectedSuggestion(prev =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          return;

        case 'Enter':
          if (selectedSuggestion >= 0) {
            event.preventDefault();
            event.stopPropagation();
            selectSuggestion(suggestions[selectedSuggestion]);
            return;
          }
          break;

        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          setShowSuggestions(false);
          setSelectedSuggestion(-1);
          return;

        case 'Tab':
          if (selectedSuggestion >= 0) {
            event.preventDefault();
            selectSuggestion(suggestions[selectedSuggestion]);
            return;
          } else if (suggestions.length > 0) {
            event.preventDefault();
            selectSuggestion(suggestions[0]);
            return;
          }
          break;
      }
    }

    // Pass through to parent handler
    onKeyDown(event);
  }, [showSuggestions, suggestions, selectedSuggestion, selectSuggestion, onKeyDown]);

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true);
          onFocusProp?.();
        }}
        placeholder={placeholder}
        className={cn(
          "h-12 pl-10 pr-10 text-lg",
          "bg-input border-border",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary",
          "placeholder:text-muted-foreground/60",
          "font-sans"
        )}
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
          aria-label="Clear search"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      {isLoading && (
        <div className="absolute right-10 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {suggestions.map((suggestion, index) => {
            const Icon = typeIcons[suggestion.type];
            return (
              <button
                key={`${suggestion.reference}-${index}`}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                  index === selectedSuggestion
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/50 text-foreground"
                )}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur
                  selectSuggestion(suggestion);
                }}
                onMouseEnter={() => setSelectedSuggestion(index)}
                tabIndex={-1}
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{suggestion.display}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60 capitalize">
                  {suggestion.type}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
