import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { safeLocalGet } from '@/core/safeStorage';
import { ContextualHint } from '@/components/onboarding/ContextualHint';
import { OnboardingManager } from '@/components/onboarding/OnboardingManager';

/**
 * VF-005 / RI-022 — a `localStorage` access can *throw* (quota, Safari private
 * mode, storage blocked by policy). The write path was already guarded via
 * `safeLocalSet`; these cover the read path, which previously called
 * `localStorage.getItem` raw on boot and on the projection path — a throw there
 * blanks a live service.
 *
 * Behavioural: asserts "does not throw + degrades to no persisted state",
 * never that a particular helper exists.
 */

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  vi.restoreAllMocks();
});

function throwOnRead() {
  return vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('SecurityError: storage is blocked');
  });
}

describe('VF-005 — localStorage reads never throw', () => {
  it('safeLocalGet returns the stored value when storage works', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('value');
    expect(safeLocalGet('guard-probe')).toBe('value');
    get.mockRestore();
  });

  it('safeLocalGet returns null and warns instead of throwing', () => {
    throwOnRead();

    expect(() => safeLocalGet('anything')).not.toThrow();
    expect(safeLocalGet('anything')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('ContextualHint still renders when the seen-flag read throws', () => {
    throwOnRead();

    expect(() =>
      render(<ContextualHint id="search" message="Try a reference" show />),
    ).not.toThrow();
    expect(screen.getByText('Try a reference')).toBeInTheDocument();
  });

  it('OnboardingManager boots to the welcome flow when the onboarded read throws', () => {
    throwOnRead();

    expect(() => render(<OnboardingManager />)).not.toThrow();
    // A failed read must mean "not onboarded", never a blank operator UI.
    expect(screen.getByText('Find any passage instantly')).toBeInTheDocument();
  });
});
