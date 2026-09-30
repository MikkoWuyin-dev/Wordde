import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings2, Monitor, RotateCcw, Keyboard, ChevronDown, ChevronLeft, Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ContextualHint } from '@/components/onboarding/ContextualHint';
import { resetOnboarding } from '@/components/onboarding/OnboardingManager';
import { ProjectionSettings } from './ProjectionSettings';
import {
  ADVERTISED_SHORTCUTS,
  HELP_TOGGLE_EVENT,
  SHORTCUT_GROUPS,
  shortcutDisplayKeys,
  type ShortcutDef,
} from '@/core/shortcutRegistry';
import { cn } from '@/lib/utils';

/**
 * SettingsAndMore — one sidebar-footer entry ("Settings & More") that opens a
 * small menu with four items:
 *
 *   • Display Settings — swaps in place to the full ProjectionSettings panel
 *     (the panel component is reused unchanged, no new props).
 *   • Theme — System (automatic default, follows the device) / Light / Dark,
 *     backed by next-themes so the choice persists app-wide.
 *   • Replay Tutorial — triggers `resetOnboarding()` exactly like the footer
 *     button it replaces (full hint reset + reload), so onboarding state and
 *     contextual-hint state reset identically.
 *   • Keyboard Shortcuts — rendered from `src/core/shortcutRegistry.ts`, the
 *     same single source the global dispatcher reads, so the help can never
 *     drift from what the keys actually do (integrity test enforces it).
 *
 * System-wide safety notes:
 *  - `ProjectionSettings` is exported bare and must stay usable with no props,
 *    so the shell owns the menu state and passes nothing to the panel.
 *  - The `display_settings` contextual hint now shows when the MENU opens —
 *    same trigger moment as the old popover-open hint.
 *  - Closing the popover resets to the menu view, so reopening never lands
 *    the operator inside a sub-view unexpectedly.
 *  - The `?` keyboard shortcut (useGlobalKeyboard dispatches
 *    `wordde:toggle-shortcut-help`) opens this shell on the shortcuts view —
 *    same contract as the old footer popover, including the toggle: pressing
 *    `?` again while the shortcuts view is showing closes the shell.
 */

export function SettingsAndMore() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'display' | 'theme' | 'shortcuts'>('menu');

  // Latest-value ref so the once-registered `?` listener can read current
  // state without being re-registered on every render.
  const stateRef = useRef({ open, view });
  useEffect(() => {
    stateRef.current = { open, view };
  });

  // "?" keyboard shortcut target (the footer help trigger it used to control
  // was removed). Toggles the shell closed when the shortcuts view is already
  // showing; otherwise opens it straight onto that view.
  useEffect(() => {
    const handler = () => {
      const { open: isOpen, view: currentView } = stateRef.current;
      if (isOpen && currentView === 'shortcuts') {
        // Close exactly like any other dismissal: back to the menu view, so
        // reopening never lands the operator inside a sub-view.
        setOpen(false);
        setView('menu');
      } else {
        setView('shortcuts');
        setOpen(true);
      }
    };
    window.addEventListener(HELP_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(HELP_TOGGLE_EVENT, handler);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      // Reopening always starts at the menu, not the previously-viewed panel.
      setView('menu');
    }
  }, []);

  return (
    <div className="border-t border-border shrink-0" data-tutorial="settings">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            className="focus-console w-full flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="font-medium">Settings &amp; More</span>
            <ChevronDown
              className={cn('h-3 w-3 ml-auto transition-transform', open && 'rotate-180')}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          collisionPadding={12}
          className={cn(
            'w-[360px] p-0 flex flex-col overflow-hidden glass-strong',
            view === 'display' && 'h-[min(80vh,560px)]',
            view === 'shortcuts' && 'max-h-[min(80vh,560px)]',
          )}
          onEscapeKeyDown={(e) => {
            // In a sub-view, Esc returns to the menu instead of dismissing
            // the popover entirely (consistent for both sub-views).
            if (view !== 'menu') {
              e.preventDefault();
              setView('menu');
            }
          }}
        >
          {view === 'menu' ? (
            <div className="py-1.5" role="menu" aria-label="Settings and more">
              <ContextualHint
                id="display_settings"
                message="Customize what appears on screen"
                show={open}
                className="px-3 pt-1.5 pb-0.5"
              />
              <button
                role="menuitem"
                onClick={() => setView('display')}
                className="focus-console w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
              >
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <span>Display Settings</span>
              </button>
              <button
                role="menuitem"
                onClick={() => setView('theme')}
                className="focus-console w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
              >
                <Laptop className="h-4 w-4 text-muted-foreground" />
                <span>Theme</span>
              </button>
              <button
                role="menuitem"
                onClick={resetOnboarding}
                className="focus-console w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
              >
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                <span>Replay Tutorial</span>
              </button>
              <button
                role="menuitem"
                onClick={() => setView('shortcuts')}
                className="focus-console w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
              >
                <Keyboard className="h-4 w-4 text-muted-foreground" />
                <span>Keyboard Shortcuts</span>
              </button>
            </div>
          ) : view === 'display' ? (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
                <button
                  onClick={() => setView('menu')}
                  aria-label="Back to menu"
                  className="focus-console flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <ProjectionSettings />
              </div>
            </div>
          ) : view === 'theme' ? (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
                <button
                  onClick={() => setView('menu')}
                  aria-label="Back to menu"
                  className="focus-console flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              </div>
              <ThemePicker />
            </div>
          ) : (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
                <button
                  onClick={() => setView('menu')}
                  aria-label="Back to menu"
                  className="focus-console flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-[9px] grid grid-cols-2 content-start gap-x-[15px] gap-y-[10.5px]">
                {SHORTCUT_GROUPS.map((group) => {
                  const rows = ADVERTISED_SHORTCUTS.filter(s => s.group === group);
                  if (rows.length === 0) return null;
                  return (
                    <div key={group} className="flex flex-col gap-[4.5px]">
                      <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide mb-[2px]">{group}</p>
                      <div className="flex flex-col gap-[4.5px]">
                        {rows.map((shortcut) => (
                          <div key={shortcut.keys} className="flex items-center justify-between gap-3 text-[11px]">
                            <span className="text-muted-foreground">{shortcut.label}</span>
                            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono shrink-0">{shortcutDisplayKeys(shortcut)}</kbd>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Theme choice: System (automatic default) / Light / Dark. Backed by
 * next-themes — `theme` is the user's stored choice ('system' until they
 * pick), so System shows as selected on fresh profiles. */
const THEME_OPTIONS = [
  { value: 'system', label: 'System', hint: 'Follow this device', icon: Laptop },
  { value: 'light', label: 'Light', hint: 'Snow ground', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Console black', icon: Moon },
] as const;

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="py-1.5 px-2 flex flex-col gap-1" role="radiogroup" aria-label="Theme">
      {THEME_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'focus-console w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
            theme === value
              ? 'bg-secondary/60 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="font-medium">{label}</span>
          <span className="ml-auto text-xs text-muted-foreground/70">{hint}</span>
        </button>
      ))}
    </div>
  );
}

/** One help row — keys column from the registry's canonical display form. */
function ShortcutRow({ shortcut }: { shortcut: ShortcutDef }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{shortcut.label}</span>
      <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">
        {shortcutDisplayKeys(shortcut)}
      </kbd>
    </div>
  );
}
