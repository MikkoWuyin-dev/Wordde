import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsAndMore } from '@/components/operator/SettingsAndMore';

/**
 * Regression suite for the "Settings & More" sidebar-footer shell.
 *
 * Pins the merged entry's contract:
 *  - one trigger opens a menu with exactly three items;
 *  - "Display Settings" swaps in the real ProjectionSettings panel in place
 *    and Back returns to the menu (no state leak between views);
 *  - "Replay Tutorial" routes through resetOnboarding — the same full reset
 *    (hint wipe + reload) the old footer button performed;
 *  - "Keyboard Shortcuts" shows the shortcut list the footer "?" trigger
 *    used to render, and Back returns to the menu;
 *  - the `?` shortcut (wordde:toggle-shortcut-help, dispatched by
 *    useGlobalKeyboard) opens the shell straight onto the shortcuts view and
 *    toggles it closed when that view is already showing;
 *  - closing and reopening always starts at the menu.
 *
 * Radix caveat (same as the keyboard suite): dismissable layers ignore
 * untrusted Escape in jsdom, so the Esc-returns-to-menu behavior inside
 * sub-views is verified live, not here.
 */

const { resetOnboardingMock } = vi.hoisted(() => ({ resetOnboardingMock: vi.fn() }));

vi.mock('@/components/onboarding/OnboardingManager', () => ({
  resetOnboarding: resetOnboardingMock,
}));

beforeEach(() => {
  localStorage.clear();
  resetOnboardingMock.mockClear();
  render(<SettingsAndMore />);
});

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /settings & more/i }));
  return waitFor(() => screen.getAllByRole('menuitem'));
}

/** Let the settings panel's async asset load settle inside act(). */
function flushEffects() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SettingsAndMore shell', () => {
  it('opens a menu with exactly three entries', async () => {
    const items = await openMenu();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Display Settings');
    expect(items[1]).toHaveTextContent('Replay Tutorial');
    expect(items[2]).toHaveTextContent('Keyboard Shortcuts');
  });

  it('Display Settings swaps in the panel in place; Back returns to the menu', async () => {
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /display settings/i }));
    await flushEffects();

    // The real ProjectionSettings panel is mounted (its blank-style options).
    expect(screen.getByText('Black Screen')).toBeTruthy();
    // The menu itself is gone — no overlapping menu items.
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    const items = await waitFor(() => screen.getAllByRole('menuitem'));
    expect(items).toHaveLength(3);
  });

  it('Replay Tutorial routes through resetOnboarding', async () => {
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /replay tutorial/i }));
    expect(resetOnboardingMock).toHaveBeenCalledTimes(1);
  });

  it('closing and reopening starts at the menu again', async () => {
    const trigger = screen.getByRole('button', { name: /settings & more/i });

    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /display settings/i }));
    await flushEffects();
    expect(screen.getByText('Black Screen')).toBeTruthy();

    fireEvent.click(trigger); // toggles the popover closed
    fireEvent.click(trigger); // and open again
    const items = await waitFor(() => screen.getAllByRole('menuitem'));
    expect(items).toHaveLength(3);
    expect(screen.queryByText('Black Screen')).toBeNull();
  });

  it('Keyboard Shortcuts shows the shortcut list; Back returns to the menu', async () => {
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /keyboard shortcuts/i }));

    // The registry-rendered list (grouped view, same rows the footer used).
    expect(screen.getByText('Navigate passages (next slide)')).toBeTruthy();
    expect(screen.getByText('Blank / unblank screen')).toBeTruthy();
    expect(screen.getByText('Undo last projection')).toBeTruthy();
    // Menu itself is gone.
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    const items = await waitFor(() => screen.getAllByRole('menuitem'));
    expect(items).toHaveLength(3);
  });

  it('the ? shortcut event opens straight onto the shortcuts view and toggles closed', async () => {
    const trigger = screen.getByRole('button', { name: /settings & more/i });

    // First dispatch: opens the shell directly on the shortcuts view.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('wordde:toggle-shortcut-help'));
    });
    await waitFor(() => expect(screen.getByText('Undo last projection')).toBeTruthy());
    expect(screen.queryByText('Display Settings')).toBeNull(); // menu not shown

    // Second dispatch while the shortcuts view is showing: closes the shell.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('wordde:toggle-shortcut-help'));
    });
    await waitFor(() => expect(screen.queryByText('Undo last projection')).toBeNull());

    // Reopening (via trigger) always starts at the menu, not the shortcuts view.
    fireEvent.click(trigger);
    const items = await waitFor(() => screen.getAllByRole('menuitem'));
    expect(items).toHaveLength(3);
  });
});
