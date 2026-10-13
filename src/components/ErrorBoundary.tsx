import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryVariant = 'operator' | 'projection';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Where the boundary sits — selects the fallback treatment and copy. */
  variant?: ErrorBoundaryVariant;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time throws so one bad subtree cannot blank the whole app.
 *
 * The projection window and the operator window are wrapped **separately**: a
 * crash in one must leave the other usable (PRODUCT.md principles 2 and 4 —
 * offline-first, "recovery over prevention"). Before this existed, a malformed
 * passage restored from storage unmounted the entire React tree to a blank
 * white page.
 *
 * The projection fallback deliberately offers only a reload: the projection
 * window is read-only and must never write the store (VF-004).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Render error caught:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isProjection = this.props.variant === 'projection';

    return (
      <div
        role="alert"
        className={
          isProjection
            ? 'min-h-screen w-screen bg-black text-snow flex flex-col items-center justify-center gap-4 p-12 text-center'
            : 'min-h-screen flex flex-col items-center justify-center gap-4 p-12 text-center bg-background text-foreground'
        }
      >
        <h2 className={isProjection ? 'text-2xl font-serif' : 'text-xl font-semibold'}>
          {isProjection ? 'Projection stopped' : 'Something went wrong'}
        </h2>
        <p className={isProjection ? 'text-snow/70 max-w-md' : 'text-sm text-muted-foreground max-w-md'}>
          {isProjection
            ? 'The projection window hit an error. The operator window is unaffected — reload to resume displaying.'
            : 'This screen hit an error. Your service plan and recent passages are stored separately and are safe — reload to continue.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={this.handleReload}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Reload
          </button>
          {!isProjection && (
            <button
              onClick={this.handleReset}
              className="px-5 py-2 rounded-xl border border-border text-sm font-medium"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
}
