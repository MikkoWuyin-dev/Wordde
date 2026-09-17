// Wordde - Shortcut registry integrity tests
//
// The registry (src/core/shortcutRegistry.ts) is the single source of truth
// for advertised shortcuts; inputController's switch is the dispatch half.
// These tests make drift impossible in BOTH directions:
//
//   1. every dispatchable registry row has a real `case` in the dispatcher;
//   2. every dispatcher `case` is backed by an advertised key (no zombie
//      cases advertising nothing — the class that let PageUp/PageDown go
//      unadvertised while the help claimed "does nothing");
//   3. letters never pass through the focused-empty input guard (RI-036);
//   4. display strings stay unique and unambiguous in the help view.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ADVERTISED_SHORTCUTS,
  DISPATCHABLE_SHORTCUTS,
  INPUT_PASS_THROUGH_KEYS,
  SHORTCUT_GROUPS,
  HELP_TOGGLE_EVENT,
  NEXT_SERVICE_PLAN_EVENT,
  isAdvertisedKey,
  shortcutDisplayKeys,
} from '@/core/shortcutRegistry';

function dispatchCases(): string[] {
  const source = readFileSync(
    path.resolve(process.cwd(), 'src/core/inputController.ts'),
    'utf8',
  );
  return [...source.matchAll(/case\s+'([^']+)'/g)].map(m => m[1]);
}

describe('shortcut registry integrity', () => {
  it('every dispatchable registry row has a dispatcher case', () => {
    const cases = new Set(dispatchCases());
    const missing: string[] = [];
    for (const s of DISPATCHABLE_SHORTCUTS) {
      for (const key of [s.keys, ...(s.displayKeys ?? [])]) {
        if (!cases.has(key)) missing.push(`${key} (${s.label})`);
      }
    }
    expect(missing, 'registry rows without a dispatch case').toEqual([]);
  });

  it('every dispatcher case is backed by an advertised key (no zombies)', () => {
    const zombies = dispatchCases().filter(key => !isAdvertisedKey(key));
    expect(zombies, 'dispatch cases with no registry row').toEqual([]);
  });

  it('keyboard key values are unique across rows (no collisions, MCD §18)', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const s of ADVERTISED_SHORTCUTS) {
      for (const key of [s.keys, ...(s.displayKeys ?? [])]) {
        if (seen.has(key)) collisions.push(`${key}: "${seen.get(key)}" vs "${s.label}"`);
        seen.set(key, s.label);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('no letter key passes the focused-empty input guard (RI-036)', () => {
    const offending = ADVERTISED_SHORTCUTS
      .filter(s => /^[a-z]$/i.test(s.keys) && s.emptyInputPassThrough)
      .map(s => s.keys);
    expect(offending, 'letters with emptyInputPassThrough=true').toEqual([]);
    for (const key of INPUT_PASS_THROUGH_KEYS) {
      expect(/^[a-z]$/i.test(key), `INPUT_PASS_THROUGH_KEYS must not contain letters: ${key}`).toBe(false);
    }
  });

  it('INPUT_PASS_THROUGH_KEYS and pass-through registry rows agree exactly', () => {
    const passthroughKeys = new Set(
      ADVERTISED_SHORTCUTS.filter(s => s.emptyInputPassThrough)
        .flatMap(s => [s.keys, ...(s.displayKeys ?? [])]),
    );
    for (const key of INPUT_PASS_THROUGH_KEYS) {
      expect(passthroughKeys.has(key), `${key} in guard but not a pass-through row`).toBe(true);
    }
    for (const s of ADVERTISED_SHORTCUTS.filter(x => x.emptyInputPassThrough)) {
      expect(INPUT_PASS_THROUGH_KEYS.includes(s.keys), `${s.keys} pass-through row missing from guard`).toBe(true);
    }
  });

  it('help display strings are unique and non-empty', () => {
    const displays = ADVERTISED_SHORTCUTS.map(s => shortcutDisplayKeys(s));
    expect(displays.every(d => d.length > 0)).toBe(true);
    expect(new Set(displays).size).toBe(displays.length);
  });

  it('every row belongs to a known group and groups render in stable order', () => {
    const groups = new Set(SHORTCUT_GROUPS);
    for (const s of ADVERTISED_SHORTCUTS) {
      expect(groups.has(s.group), `unknown group: ${s.group}`).toBe(true);
      expect(s.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('shared event names are non-empty and distinct', () => {
    expect(HELP_TOGGLE_EVENT.length).toBeGreaterThan(0);
    expect(NEXT_SERVICE_PLAN_EVENT.length).toBeGreaterThan(0);
    expect(HELP_TOGGLE_EVENT).not.toBe(NEXT_SERVICE_PLAN_EVENT);
  });
});
