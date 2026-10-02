import { useEffect, useState } from 'react';
import packageJson from '../../../package.json';
import { OnboardingManager } from '@/components/onboarding/OnboardingManager';
import { ContextualHint } from '@/components/onboarding/ContextualHint';
import { useInputController, useGlobalKeyboard } from '@/core/inputController';
import { useStateManager } from '@/core/stateManager';
import { useOperatorLease } from '@/hooks/useOperatorLease';
import { BibleRepository } from '@/core/bibleRepository';
import { SearchEngine } from '@/core/searchEngine';
import { SearchInput } from './SearchInput';
import { ResultsList } from './ResultsList';
import { PresenterPanel } from './PresenterPanel';
import { PassageNavigation } from './PassageNavigation';
import { BibleNavigator } from './BibleNavigator';
import { ServicePlan } from './ServicePlan';
import { RecentPassages } from './RecentPassages';
import { SettingsAndMore } from './SettingsAndMore';
import { ProjectionControl } from './ProjectionControl';
import { Book, BookX, Monitor, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
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
  /** Total boot failure (zero translations loaded) — shown as a blocking screen. */
  const [bootError, setBootError] = useState<string | null>(null);
  /** Per-translation boot failures (partial success) — surfaced, never hidden (RI-044). */
  const [failedTranslations, setFailedTranslations] = useState<{ code: string; error: string }[]>([]);

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

  // RI-001 — single authoritative operator. Another window holding a fresh
  // lease blocks this one before any boot work (Bible preload) starts; only an
  // explicit takeOver() can make this window the operator.
  const { status: leaseStatus, takeOver } = useOperatorLease();

  useEffect(() => {
    if (!isBibleLoaded && leaseStatus === 'active') {
      setLoading(true);
      Promise.all([
        BibleRepository.preloadAllTranslations(),
        SearchEngine.loadSemanticIndex('/data/semanticIndex.json'),
      ])
        .then(() => {
          setBibleLoaded(true);
          setLoading(false);
          // Surface any per-translation boot failures (teardown follow-up #5):
          // the app continues with what loaded, but the operator must SEE what
          // is missing — silent emptiness reads as “the app is broken” (RI-044).
          setFailedTranslations(BibleRepository.getTranslationHealth().failed);
          // Bible data is available — only now can the active projection
          // session be reconstructed after an operator reload/crash.
          useStateManager.getState().restoreProjectionSession();
        })
        .catch((error) => {
          console.error('Failed to load Bible:', error);
          // Total failure (zero translations): show a visible, actionable
          // blocking screen instead of an app that can never work.
          setBootError(error instanceof Error ? error.message : String(error));
          setLoading(false);
        });
    }
  }, [isBibleLoaded, leaseStatus, setBibleLoaded, setLoading]);


  // Blocked: another window is the operator. Show the gate instead of the
  // operator UI so there is never a second competing writer.
  if (leaseStatus === 'blocked') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <Monitor className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">
            Wordde is already the operator in another window or tab
          </h2>
          <p className="text-muted-foreground">
            Only one window can control the projection. Close the other window,
            or take over here — the other window will then stop controlling the
            projection.
          </p>
          <Button onClick={takeOver}>Take over here</Button>
        </div>
      </div>
    );
  }

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

  // Total boot failure: no translation could load (missing/corrupt data files,
  // storage unreadable). Nothing in the app can work — fail visibly (RI-044).
  if (bootError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <BookX className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">Bible data could not be loaded</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            None of the translations could be read from this device. Check that
            the app files are intact, then reload this window.
          </p>
          <p className="text-[11px] text-muted-foreground/70 font-mono break-all">{bootError}</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }

  const healthyTranslations = BibleRepository
    .getAvailableTranslations()
    .filter((t) => !failedTranslations.some((f) => f.code === t));
  const currentTranslationFailed = failedTranslations.some((f) => f.code === currentTranslation);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <OnboardingManager />
      {/* Partial boot failure banner (teardown follow-up #5 / RI-044): the app
          works with what loaded, but the operator must see what is missing and
          how to recover — switch to a healthy translation below. */}
      {failedTranslations.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="shrink-0 bg-destructive/10 border-b border-destructive/30 px-4 py-1.5 text-xs text-destructive flex items-center gap-2"
        >
          <BookX className="h-3.5 w-3.5 shrink-0" />
          <span>
            {failedTranslations.map((f) => f.code).join(', ')} could not be loaded — switch to a
            healthy translation above if needed.
          </span>
        </div>
      )}
      {/* Header */}
      <header className="glass shrink-0 rounded-none">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="font-wordmark font-normal text-3xl min-[1100px]:text-4xl leading-none tracking-normal text-foreground">Wordde</h1>
            <div className="flex items-center gap-2 min-w-0">
              <Select
                value={currentTranslation}
                onValueChange={(value) => {
                  setTranslation(value);
                }}
              >
                <SelectTrigger
                  className="h-8 px-2 text-xs font-medium min-w-[92px] text-muted-foreground"
                  title="Switch translation"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {healthyTranslations.map((t) => (
                    <SelectItem key={t} value={t} className="text-foreground">{t}</SelectItem>
                  ))}
                  {failedTranslations.map((f) => (
                    <SelectItem
                      key={f.code}
                      value={f.code}
                      disabled
                      className="text-muted-foreground/50"
                    >
                      {f.code} — unavailable
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-xs gap-1 text-muted-foreground/80 hover:text-foreground"
                onClick={undoProjection}
                disabled={historyStack.length === 0}
                title="Undo last projection (Ctrl+Z)"
              >
                <Undo2 className="h-3 w-3" />
                <span className="hidden sm:inline">Undo</span>
                {historyStack.length > 0 && (
                  <span className="ml-0.5 text-[10px] text-muted-foreground tabular-nums">({historyStack.length})</span>
                )}
              </Button>
            {committedPassage && (
              <div className="chip-onair-slim">
                <Monitor className="h-3.5 w-3.5" />
                <PassageNavigation />
              </div>
            )}
            <div className="flex-1" />
            <ProjectionControl />
            <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/40 select-none pointer-events-none">Beta</span>
          </div>
        </div>
      </div>
      </header>

      {/* Main dual-column layout */}
      <main className="flex-1 flex min-h-0">
        {/* Left Column - Tab-based workflow */}
        <div className="w-[380px] shrink-0 border-r border-border flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-border/60 shrink-0">
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
                    'focus-console flex-1 px-3 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px',
                    isActive
                      ? // The selected fill WITHOUT its full inset ring — the
                        // paprika underline is the tab's voice; a ring on the
                        // other three sides reads as an orange box. The
                        // utility replaces the recipe's box-shadow (utilities
                        // layer wins), re-adding only the glass top highlight.
                        'glass-item-selected border-paprika text-paprika shadow-[inset_0_1px_0_hsl(var(--glass-highlight))]'
                      : 'glass-item border-transparent text-muted-foreground hover:text-foreground'
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
              <div className="p-3 space-y-2" data-tutorial="search">
                <SearchInput
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onClear={clearPreview}
                  onSelectSuggestion={handleSuggestionSelect}
                  isLoading={isLoading}
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

          {/* Settings & More menu at bottom (display settings + tutorial replay) */}
          <SettingsAndMore />
        </div>

        {/* Right Column - Presenter Panel */}
        <div className="flex-1 min-w-0 flex flex-col" data-tutorial="presenter">
          {/* One-time hint on first projection — same treatment as the other panel hints. */}
          <ContextualHint id="keyboard_nav" message="Use ← → to move between passages" show={!!committedPassage} className="mx-4 mt-2" />
          <PresenterPanel />
        </div>
      </main>

      {/* Footer: pointer to Settings & More + app version */}
      <footer className="glass shrink-0 rounded-none">
        <div className="px-4 py-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/70">
              Display settings, tutorial replay &amp; keyboard shortcuts live in Settings &amp; More (sidebar footer).
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/60 select-none pointer-events-none">v{packageJson.version}</span>
        </div>
      </footer>
    </div>
  );
}
