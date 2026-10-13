import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * The projection window and the operator window are independent surfaces. A
 * render throw must be contained by the route's own boundary, not unmount the
 * whole tree (see audit §3.2 / PRODUCT.md principles 2 and 4).
 */

function Boom(): never {
  throw new Error('boom');
}

function Fine() {
  return <div>operator still renders</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary — one route survives another route throwing', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary variant="operator">
        <Fine />
      </ErrorBoundary>,
    );
    expect(screen.getByText('operator still renders')).toBeInTheDocument();
  });

  it('replaces a throwing child with its fallback instead of propagating', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <ErrorBoundary variant="projection">
          <Boom />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Projection stopped/i)).toBeInTheDocument();
    error.mockRestore();
  });

  it('a throwing projection boundary does not take down a sibling operator boundary', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <ErrorBoundary variant="operator">
          <Fine />
        </ErrorBoundary>
        <ErrorBoundary variant="projection">
          <Boom />
        </ErrorBoundary>
      </div>,
    );
    // Sibling survived; the failure stayed local to its own route.
    expect(screen.getByText('operator still renders')).toBeInTheDocument();
    expect(screen.getByText(/Projection stopped/i)).toBeInTheDocument();
    error.mockRestore();
  });

  it('"Try again" clears the error and re-renders the children', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('boom');
      return <div>recovered</div>;
    }

    render(
      <ErrorBoundary variant="operator">
        <Flaky />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
    error.mockRestore();
  });
});
