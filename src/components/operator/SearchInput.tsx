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

/** The canonical search-field copy, single-sourced because the operator UI
 * and the e2e suite both key off it. Do NOT pass a divergent `placeholder`
 * at a call site — `searchInputKeys.test.tsx` has a source drift guard that
 * fails the build if one appears (a divergent override once broke the e2e
 * locator by silently replacing this copy). */
export const SEARCH_PLACEHOLDER = 'Search by reference or keyword... (e.g., John 3:16)';

export function SearchInput({
  value,
  onChange,
  onKeyDown,
  onClear,
  onSelectSuggestion,
  isLoading = false,
  placeholder = SEARCH_PLACEHOLDER,
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

  /**
   * Committing from this field must hand focus back to the operator surface.
   * While the input keeps focus with text in it, the global keyboard guard
   * correctly blocks letters (typing must never double-fire shortcuts), so
   * "P — project current slide" stayed dead after every projection until the
   * operator clicked away. Enter/click commits blur the field instead.
   */
  const releaseFocusAfterCommit = useCallback(() => {
    inputRef.current?.blur();
  }, []);

  const selectSuggestion = useCallback((suggestion: Suggestion) => {
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion.reference);
    } else {
      onChange(suggestion.reference);
    }
    releaseFocusAfterCommit();
  }, [onChange, onSelectSuggestion, releaseFocusAfterCommit]);

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
          // Plain Enter: forward to the parent (which commits the selected
          // result), then release focus so P/B/C/N work immediately after.
          onKeyDown(event);
          releaseFocusAfterCommit();
          return;

        case 'Escape':
          event.preventDefault();
          // Close the dropdown if it is open, but ALWAYS forward the event:
          // swallowing Escape here made "Esc — clear preview" dead whenever
          // suggestions were showing (e.g. right after committing — the
          // field still holds text, so the dropdown reopens immediately).
          setShowSuggestions(false);
          setSelectedSuggestion(-1);
          break;

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

    // Dropdown closed (or key not handled above): forward to the parent.
    // Enter commits and Escape clears the preview — both end the typing
    // session, so release focus afterward and the global letter shortcuts
    // (P/B/C/N) work immediately, matching the dropdown-open Enter path.
    if (event.key === 'Enter' || event.key === 'Escape') {
      onKeyDown(event);
      releaseFocusAfterCommit();
      return;
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
        onBlur={() => {
          // The dropdown is a focused-field affordance. Hiding it on blur
          // means committing from the field can never leave a stale dropdown
          // around to swallow the next Escape or arrow key. Close-on-outside-
          // click already covers clicks elsewhere.
          setShowSuggestions(false);
          setSelectedSuggestion(-1);
        }}
        placeholder={placeholder}
        className={cn(
          "h-12 pl-10 pr-10 text-lg rounded-xl",
          "bg-card border border-border shadow-[var(--shadow-soft)]",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-paprika",
          "focus-visible:shadow-[var(--shadow-strong)]",
          "placeholder:text-muted-foreground/60",
          "font-sans"
        )}
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-snow-soft transition-colors"
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
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-[var(--shadow-popover)] overflow-hidden">
          {suggestions.map((suggestion, index) => {
            const Icon = typeIcons[suggestion.type];
            return (
              <button
                key={`${suggestion.reference}-${index}`}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                  index === selectedSuggestion
                    ? "bg-hunter/15 text-hunter-bright border border-hunter/30"
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
                <span className="ml-auto text-[10px] text-muted-foreground capitalize">
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
