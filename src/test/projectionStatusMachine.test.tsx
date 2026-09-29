import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ProjectionControl } from '@/components/operator/ProjectionControl';
import { getChannel } from '@/core/broadcastSync';
import { FakeBroadcastChannel } from './fakeBroadcastChannel';

/** The component's channel singleton, cast to the Fake for emitting. */
const bus = () => getChannel() as unknown as FakeBroadcastChannel;

/**
 * Projection-control status machine (audit item 4 + regression barrier).
 *
 * States: idle → connecting → active ⇄ disconnected → idle(window closed),
 * plus blocked (popup refused) with its recovery dialog.
 *
 * Timers: the machine has three intervals (heartbeat watchdog 2 s, window
 * polling 1.5 s, state re-sync 3 s) and uses real Date.now(), so tests run
 * with fake timers and advance through the watchdog windows.
 */

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

const openBtn = () => screen.getByRole('button', { name: /start projection/i });

describe('projection status machine', () => {
  it('starts idle and shows "Not started"', () => {
    render(<ProjectionControl />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(openBtn()).toBeEnabled();
  });

  it('popup blocked: window.open → null transitions to blocked with recovery guidance', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ProjectionControl />);

    fireEvent.click(openBtn());

    // While the blocked dialog is open, Radix aria-hides background content —
    // assert inside the dialog: guidance copy + Try again + the disabled state.
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText(/browser blocked the projection window/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    openSpy.mockRestore();
  });

  it('blocked recovery: dismissing the dialog returns to idle; Try again re-opens the window', () => {
    let openCalls = 0;
    vi.spyOn(window, 'open').mockImplementation(() => {
      openCalls += 1;
      return null; // stays blocked on both attempts in this test
    });
    render(<ProjectionControl />);

    fireEvent.click(openBtn());
    expect(screen.getByText('Blocked')).toBeInTheDocument();

    // "Try again" goes through startProjection again (still blocked).
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(openCalls).toBe(2);
    expect(screen.getByText('Blocked')).toBeInTheDocument();

    // Dismissing via the dialog's Close button (onOpenChange(false)) resets to
    // idle. (Radix Esc handling needs trusted events — not testable in jsdom,
    // per the project's existing caveat; the Close button drives the same path.)
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('success path: window.open returns a live window; PROJECTOR_READY activates and shows setup', () => {
    const win = { closed: false, focus: () => {} };
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    render(<ProjectionControl />);

    fireEvent.click(openBtn());
    expect(screen.getByText('Connecting…')).toBeInTheDocument();

    act(() => {
      bus().emit({ type: 'PROJECTOR_READY', version: 1 });
    });

    expect(screen.getByText('Connected')).toBeInTheDocument();
    // First successful projection shows the guided setup dialog (R5 path).
    expect(screen.getByText('Set Up Projection')).toBeInTheDocument();
  });

  it('heartbeat while connecting or disconnected re-activates the link', () => {
    const win = { closed: false, focus: () => {} };
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    render(<ProjectionControl />);

    fireEvent.click(openBtn());
    // HEARTBEAT alone (no PROJECTOR_READY) also activates.
    act(() => {
      bus().emit({ type: 'HEARTBEAT', timestamp: Date.now(), version: 1 });
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();

    // Silence beyond the 5 s watchdog flips to disconnected.
    act(() => {
      vi.advanceTimersByTime(7200);
    });
    expect(screen.getByText('Disconnected')).toBeInTheDocument();

    // A fresh heartbeat restores the link.
    act(() => {
      bus().emit({ type: 'HEARTBEAT', timestamp: Date.now(), version: 1 });
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('heartbeat loss while active flips to disconnected (watchdog, 5 s of silence)', () => {
    const win = { closed: false, focus: () => {} };
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    render(<ProjectionControl />);

    fireEvent.click(openBtn());
    act(() => {
      bus().emit({ type: 'PROJECTOR_READY', version: 1 });
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();

    // Dismiss the auto-shown setup dialog so background status is assertable.
    fireEvent.click(screen.getByRole('button', { name: /projection ready/i }));

    act(() => {
      vi.advanceTimersByTime(7200); // watchdog interval 2 s; needs > 5 s silence
    });
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('window closed: polled window.closed returns the status to idle', () => {
    const win = { closed: false, focus: () => {} };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    render(<ProjectionControl />);

    fireEvent.click(openBtn());
    act(() => {
      bus().emit({ type: 'PROJECTOR_READY', version: 1 });
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();

    // Dismiss the auto-shown setup dialog so background status is assertable.
    fireEvent.click(screen.getByRole('button', { name: /projection ready/i }));

    // User closes the projection window; the 1.5 s poll notices.
    (win as { closed: boolean }).closed = true;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(openSpy).toHaveBeenCalledWith('/projection', 'projectionWindow', 'width=1280,height=720');
  });

  it('opened-then-immediately-closed window is treated as blocked', () => {
    const win = { closed: true, focus: () => {} };
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    render(<ProjectionControl />);

    fireEvent.click(openBtn());
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText(/browser blocked the projection window/i)).toBeInTheDocument();
  });
});
