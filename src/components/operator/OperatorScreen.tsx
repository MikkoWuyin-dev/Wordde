import { useEffect, useState } from 'react';
import packageJson from '../../../package.json';
import { OnboardingManager, resetOnboarding } from '@/components/onboarding/OnboardingManager';
import { ContextualHint } from '@/components/onboarding/ContextualHint';
import { useInputController, useGlobalKeyboard } from '@/core/inputController';
import { useStateManager } from '@/core/stateManager';
import { BibleRepository } from '@/core/bibleRepository';
import { SearchEngine } from '@/core/searchEngine';
import { SearchInput } from './SearchInput';
import { ResultsList } from './ResultsList';
import { PresenterPanel } from './PresenterPanel';
import { PassageNavigation } from './PassageNavigation';
import { BibleNavigator } from './BibleNavigator';
import { ServicePlan } from './ServicePlan';
import { RecentPassages } from './RecentPassages';
import { ProjectionSettings } from './ProjectionSettings';
import { ProjectionControl } from './ProjectionControl';
import { Book, Monitor, HelpCircle, Undo2, Settings2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type TabId = 'search' | 'browse' | 'plan' | 'recent';

const tabs: { id: TabId; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'browse', label: 'Browse' },
  { id: 'plan', label: 'Plan' },
  { id: 'recent', label: 'Recent' },
];

export function OperatorScreen() {
  const [activeTab, setActiveTab] = useState<TabId>('search');
  const [searchFocused, setSearchFocused] = useState(false);
  const [browseOpened, setBrowseOpened] = useState(false);
  const [planOpened, setPlanOpened] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [arrowUsed, setArrowUsed] = useState(false);

  // Track arrow key usage for keyboard hint
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setArrowUsed(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const {
    searchQuery,
    searchResults,
    selectedResultIndex,
    handleInputChange,
    handleKeyDown,
    handleResultSelect,
    handleSuggestionSelect,
    clearPreview,
  } = useInputController();

  const {
    committedPassage,
    isLoading,
    isBibleLoaded,
    setBibleLoaded,
    setLoading,
    currentTranslation,
    setTranslation,
    undoProjection,
    historyStack,
  } = useStateManager();

  useGlobalKeyboard();

  useEffect(() => {
    if (!isBibleLoaded) {
      setLoading(true);
      Promise.all([
        BibleRepository.preloadAllTranslations(),
        SearchEngine.loadSemanticIndex('/data/semanticIndex.json'),
      ])
        .then(() => {
          setBibleLoaded(true);
          setLoading(false);
          // Bible data is available — only now can the active projection
          // session be reconstructed after an operator reload/crash.
          useStateManager.getState().restoreProjectionSession();
        })
        .catch((error) => {
          console.error('Failed to load Bible:', error);
          setLoading(false);
        });
    }
  }, [isBibleLoaded, setBibleLoaded, setLoading]);


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-lg text-muted-foreground">Loading translations…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <OnboardingManager />
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-sm text-foreground">Wordde</h1>

            <div className="flex items-center gap-2">
              {/* Translation selector - styled Select component */}
              <Select
                value={currentTranslation}
                onValueChange={(value) => {
                  setTranslation(value);
                }}
              >
                <SelectTrigger
                  className="h-8 px-2 text-xs font-medium min-w-[80px]"
                  title="Switch translation"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BibleRepository.getAvailableTranslations().map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Undo button - tertiary, subtle */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-xs gap-1 opacity-80 hover:opacity-100"
                onClick={undoProjection}
                disabled={historyStack.length === 0}
                title="Undo last projection (Ctrl+Z)"
              >
                <Undo2 className="h-3 w-3" />
                <span className="hidden sm:inline">Undo</span>
                {historyStack.length > 0 && (
                  <span className="ml-0.5 text-[10px] text-muted-foreground">({historyStack.length})</span>
                )}
              </Button>

              {/* Live projection indicator - quiet, contextual */}
              {committedPassage && (
                <div className="h-7 flex items-center gap-1.5 px-2 rounded-md bg-primary/5 border border-primary/10">
                  <Monitor className="h-3 w-3 text-primary/70" />
                  <PassageNavigation />
                </div>
              )}

              {/* Spacer to push projection control to the edge */}
              <div className="flex-1" />

              {/* Projection control - primary action, prominent */}
              <ProjectionControl />
            </div>
          </div>
        </div>
      </header>

      {/* Main dual-column layout */}
      <main className="flex-1 flex min-h-0">
        {/* Left Column - Tab-based workflow */}
        <div className="w-[380px] shrink-0 border-r border-border flex flex-col bg-card/30">
          {/* Tab bar */}
          <div className="flex border-b border-border shrink-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'browse') setBrowseOpened(true);
                    if (tab.id === 'plan') setPlanOpened(true);
                  }}
                  className={cn(
                    'flex-1 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <ScrollArea className="flex-1 min-h-0">
            {activeTab === 'search' && (
              <div className="p-3 space-y-2" data-tutorial="search" onKeyDown={handleKeyDown}>
                <SearchInput
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onClear={clearPreview}
                  onSelectSuggestion={handleSuggestionSelect}
                  isLoading={isLoading}
                  placeholder="Search reference or keyword..."
                  onFocus={() => setSearchFocused(true)}
                />
                <ContextualHint id="search" message='Type a passage like "John 3:16"' show={searchFocused} />
                {searchResults.length > 0 && (
                  <ResultsList
                    results={searchResults}
                    selectedIndex={selectedResultIndex}
                    onSelect={handleResultSelect}
                  />
                )}
              </div>
            )}

            {activeTab === 'browse' && (
              <div data-tutorial="navigator">
                <ContextualHint id="browse" message="Select a book → chapter → passage" show={browseOpened} className="mx-2 mt-2" />
                <BibleNavigator />
              </div>
            )}

            {activeTab === 'plan' && (
              <div data-tutorial="service">
                <ContextualHint id="service_plan" message="Add passages here to prepare your service" show={planOpened} className="mx-2 mt-2" />
                <ServicePlan />
              </div>
            )}

            {activeTab === 'recent' && (
              <div data-tutorial="recent">
                <RecentPassages />
              </div>
            )}
          </ScrollArea>

          {/* Display Settings dropdown at bottom */}
          <div className="border-t border-border shrink-0">
            <Popover onOpenChange={(open) => { if (open) setSettingsOpened(true); }}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors">
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="font-medium">Display Settings</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                collisionPadding={12}
                className="w-[360px] p-0 flex flex-col overflow-hidden"
                style={{ height: 'min(80vh, 560px)' }}
              >
                <ContextualHint id="display_settings" message="Customize what appears on screen" show={settingsOpened} className="m-3 mb-0 shrink-0" />
                <ProjectionSettings />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Right Column - Presenter Panel */}
        <div className="flex-1 min-w-0 flex flex-col" data-tutorial="presenter">
          <ContextualHint id="keyboard_nav" message="Use ← → to move between passages" show={arrowUsed} className="mx-3 mt-2" />
          <PresenterPanel />
        </div>
      </main>

      {/* Keyboard shortcut hint bar */}
      <footer className="border-t border-border bg-card/50 shrink-0">
        <div className="px-4 py-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <button
              onClick={resetOnboarding}
              className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Replay full onboarding and reset all hints"
            >
              <HelpCircle className="h-3 w-3" />
              <span>Replay Tutorial</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-[11px]">
              <span>
                <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">←</kbd> Prev
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">→</kbd> Next
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">↑↓</kbd> Results
              </span>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground hover:text-foreground"
                  title="Show all keyboard shortcuts"
                >
                  <span className="text-[10px] font-mono">?</span>
                  <span className="text-[10px]">More</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                className="w-56 p-3"
              >
                <p className="text-[10px] font-medium text-muted-foreground mb-2">Keyboard Shortcuts</p>
                <div className="space-y-1.5">
                  {[
                    { keys: '← →', label: 'Navigate passages' },
                    { keys: '↑ ↓', label: 'Select search result' },
                    { keys: 'N', label: 'Next service plan passage' },
                    { keys: 'B', label: 'Blank / unblank screen' },
                    { keys: 'P', label: 'Project current slide' },
                    { keys: '⌘Z', label: 'Undo last projection' },
                    { keys: 'Esc', label: 'Clear preview' },
                    { keys: '?', label: 'Show this help' },
                  ].map((shortcut) => (
                    <div key={shortcut.keys} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{shortcut.label}</span>
                      <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">{shortcut.keys}</kbd>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <span className="text-[10px] text-muted-foreground/60 select-none pointer-events-none">v{packageJson.version}</span>
        </div>
      </footer>
    </div>
  );
}
