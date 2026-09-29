import { useState, useEffect, useRef, useCallback } from 'react';
import { onBroadcastMessage, broadcastStateResponse, broadcastSync, loadBlankSettings } from '@/core/broadcastSync';
import { useStateManager } from '@/core/stateManager';
import { Monitor, ExternalLink, Wifi, WifiOff, MonitorUp, Maximize, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type ProjectionStatus = 'idle' | 'connecting' | 'active' | 'disconnected' | 'blocked';

const SETUP_STEPS = [
  {
    icon: MonitorUp,
    title: 'Move the projection window to your TV screen',
    description: 'Drag the new window onto your external display',
  },
  {
    icon: Maximize,
    title: 'Press F11 to enter fullscreen',
    description: 'On the projection window, press F11 for fullscreen mode',
  },
  {
    icon: CheckCircle2,
    title: 'Ensure only the verse is visible on the TV',
    description: 'Confirm the projection fills the entire screen',
  },
];

export function ProjectionControl() {
  const [status, setStatus] = useState<ProjectionStatus>('idle');
  const [showSetup, setShowSetup] = useState(false);
  const projectorWindowRef = useRef<Window | null>(null);
  const lastHeartbeatRef = useRef<number>(0);

  const { committedPassage, isScreenBlanked } = useStateManager();

  // Listen for PROJECTOR_READY + HEARTBEAT
  useEffect(() => {
    const unsub = onBroadcastMessage((msg) => {
      if (msg.type === 'PROJECTOR_READY') {
        // READY is liveness evidence: stamp the watchdog clock. Without this,
        // a projector that died between READY and its first heartbeat kept
        // the operator on "Connected" forever — the watchdog guard requires
        // lastHeartbeatRef to be set. (Found by the status-machine tests.)
        lastHeartbeatRef.current = Date.now();
        if (status === 'connecting') {
          setShowSetup(true);
        }
        setStatus('active');
      } else if (msg.type === 'HEARTBEAT') {
        lastHeartbeatRef.current = msg.timestamp;
        if (status === 'disconnected' || status === 'connecting') {
          setStatus('active');
        }
      } else if (msg.type === 'REQUEST_STATE') {
        const state = useStateManager.getState();
        broadcastStateResponse(state.committedPassage);
      }
    });
    return unsub;
  }, [status]);

  // Heartbeat timeout checker
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastHeartbeatRef.current && Date.now() - lastHeartbeatRef.current > 5000) {
        if (status === 'active') setStatus('disconnected');
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  // Check if projection window was closed
  useEffect(() => {
    const interval = setInterval(() => {
      if (projectorWindowRef.current && projectorWindowRef.current.closed) {
        projectorWindowRef.current = null;
        setStatus('idle');
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Periodic state re-sync
  useEffect(() => {
    const interval = setInterval(() => {
      const state = useStateManager.getState();
      broadcastSync(
        state.committedPassage,
        state.isScreenBlanked,
        state.isScreenBlanked ? loadBlankSettings() : undefined
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const startProjection = useCallback(() => {
    // If window exists and is open, just focus
    if (projectorWindowRef.current && !projectorWindowRef.current.closed) {
      projectorWindowRef.current.focus();
      if (status === 'disconnected') {
        const state = useStateManager.getState();
        broadcastSync(
          state.committedPassage,
          state.isScreenBlanked,
          state.isScreenBlanked ? loadBlankSettings() : undefined
        );
        setStatus('active');
      }
      return;
    }

    setStatus('connecting');
    const opened = window.open(
      '/projection',
      'projectionWindow',
      'width=1280,height=720'
    );

    // Popup-blocked detection (audit P1 UX #9): window.open returns null when
    // the browser blocks the popup. Previously the status stuck on
    // "Connecting…" forever with no explanation. Distinguish three outcomes:
    //   • null              → blocked: show recovery guidance
    //   • window + closed   → opened then immediately closed: same treatment
    //   • window + open     → normal path; PROJECTOR_READY/HEARTBEAT take over
    if (!opened || opened.closed) {
      projectorWindowRef.current = null;
      setStatus('blocked');
      return;
    }
    projectorWindowRef.current = opened;

    // Send INIT state after a short delay
    setTimeout(() => {
      const state = useStateManager.getState();
      broadcastSync(
        state.committedPassage,
        state.isScreenBlanked,
        state.isScreenBlanked ? loadBlankSettings() : undefined
      );
    }, 500);
  }, [status]);

  /** Recovery from 'blocked': retry through the same window.open path (a
   * user gesture is present, so most blockers allow it now). */
  const retryProjection = useCallback(() => {
    setStatus('idle');
    startProjection();
  }, [startProjection]);

  const handleSetupComplete = useCallback(() => {
    setShowSetup(false);
  }, []);

  const statusConfig = {
    idle: {
      label: 'Start Projection',
      icon: ExternalLink,
      variant: 'default' as const,
      disabled: false,
    },
    connecting: {
      label: 'Setting up…',
      icon: Monitor,
      variant: 'outline' as const,
      disabled: true,
    },
    active: {
      label: 'Projection Active',
      icon: Wifi,
      variant: 'outline' as const,
      disabled: false,
    },
    disconnected: {
      label: 'Reconnect',
      icon: WifiOff,
      variant: 'destructive' as const,
      disabled: false,
    },
    blocked: {
      label: 'Popup Blocked',
      icon: ShieldAlert,
      variant: 'destructive' as const,
      disabled: false,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <>
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              status === 'active' && 'bg-paprika animate-spark',
              status === 'connecting' && 'bg-yellow animate-spark',
              status === 'disconnected' && 'bg-destructive',
              status === 'blocked' && 'bg-destructive',
              status === 'idle' && 'bg-muted-foreground/40'
            )}
          />
          <span className="hidden sm:inline whitespace-nowrap">
            {status === 'active' && 'Connected'}
            {status === 'connecting' && 'Connecting…'}
            {status === 'disconnected' && 'Disconnected'}
            {status === 'blocked' && 'Blocked'}
            {status === 'idle' && 'Not started'}
          </span>
        </div>

            <button
              type="button"
              className="btn-projection-glass"
              onClick={startProjection}
              disabled={config.disabled}
            >
              <Icon className="h-3.5 w-3.5" />
              {config.label}
            </button>
      </div>

      {/* Popup-blocked guidance (audit P1 UX #9): visible, actionable recovery
          instead of an endless "Connecting…". */}
      {status === 'blocked' && (
        <Dialog open onOpenChange={(open) => { if (!open) setStatus('idle'); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Your browser blocked the projection window
              </DialogTitle>
              <DialogDescription>
                Wordde opens a second window for the TV or projector, and the
                browser stopped it. Allow pop-ups for this site, or try again —
                this button usually works because you just clicked it.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={retryProjection} className="w-full" size="lg">
              <ExternalLink className="h-4 w-4 mr-2" />
              Try again
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Setup Guide Dialog */}
      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>              <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-paprika-bright" />
              Set Up Projection
            </DialogTitle>
            <DialogDescription>
              Follow these steps to configure your external display.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-4 my-2">
            {SETUP_STEPS.map((step, i) => {
              const StepIcon = step.icon;
              return (
                <li key={i} className="flex gap-3 items-start">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-paprika/15 flex items-center justify-center">
                    <StepIcon className="h-4 w-4 text-paprika-bright" />
                  </div>
                  <div className="pt-0.5">
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <Button
            onClick={handleSetupComplete}
            className="w-full mt-2 animate-pulse hover:animate-none"
            size="lg"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Projection Ready
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
