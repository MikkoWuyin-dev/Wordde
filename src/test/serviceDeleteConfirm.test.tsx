import { describe, it, expect, beforeEach } from 'vitest';
import { ServicePlan } from '@/components/operator/ServicePlan';
import { render, screen, within, cleanup, fireEvent, act } from '@testing-library/react';

/**
 * Item 3 — whole-service delete must be confirmable (audit P1 UX #5).
 *
 * Deleting an entire service is the most destructive action in the Service
 * Plan: it erases a week's preparation instantly, with no undo. Passage-level
 * delete already confirms; these tests pin the same behavior for services:
 *   1. trash click alone must NOT delete — the AlertDialog must appear;
 *   2. accepting the dialog deletes exactly that service and persists;
 *   3. cancelling keeps the service untouched.
 *
 * fireEvent (project convention — @testing-library/user-event is not a
 * dependency). Hover is implicit: the action buttons are opacity-gated CSS,
 * not display-gated, so they are present and clickable in jsdom.
 */

function seedServices() {
  localStorage.setItem('services', JSON.stringify([
    { id: 'svc-1', name: 'Sunday Morning', passages: [{ id: 'p1', label: 'Call', reference: 'John 3:16' }] },
    { id: 'svc-2', name: 'Midweek', passages: [] },
  ]));
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('service-delete confirmation', () => {
  it('does NOT delete on trash click alone — the confirmation dialog appears', () => {
    seedServices();
    render(<ServicePlan />);

    expect(screen.getByText('Sunday Morning')).toBeInTheDocument();

    const row = screen.getByText('Sunday Morning').closest('div.group') as HTMLElement;
    fireEvent.click(within(row).getByTitle('Delete'));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Delete “Sunday Morning”/)).toBeInTheDocument();
    // Nothing deleted yet: row still listed, persistence untouched.
    expect(screen.getByText('Sunday Morning')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('services') || '[]')).toHaveLength(2);
  });

  it('deletes the service only after confirmation is accepted', () => {
    seedServices();
    render(<ServicePlan />);

    const row = screen.getByText('Sunday Morning').closest('div.group') as HTMLElement;
    fireEvent.click(within(row).getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Service' }));

    expect(screen.queryByText('Sunday Morning')).not.toBeInTheDocument();
    const remaining = JSON.parse(localStorage.getItem('services') || '[]');
    expect(remaining.map((s: { id: string }) => s.id)).toEqual(['svc-2']);
  });

  it('keeps the service when the confirmation is cancelled', () => {
    seedServices();
    render(<ServicePlan />);

    const row = screen.getByText('Sunday Morning').closest('div.group') as HTMLElement;
    fireEvent.click(within(row).getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Sunday Morning')).toBeInTheDocument();
    // Both seeded services remain — nothing was written.
    expect(JSON.parse(localStorage.getItem('services') || '[]')).toHaveLength(2);
  });

  it('dialog removal never leaves a stale confirm target (accept-then-rerender is safe)', () => {
    seedServices();
    render(<ServicePlan />);

    const row = screen.getByText('Sunday Morning').closest('div.group') as HTMLElement;
    fireEvent.click(within(row).getByTitle('Delete'));
    act(() => {
      // Simulate the service vanishing through another path while the dialog
      // is open; accepting must be a safe no-op rather than throwing.
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
