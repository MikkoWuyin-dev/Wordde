import { useState, useEffect, useRef, useCallback } from 'react';
import { onBroadcastMessage, broadcastStateResponse, broadcastSync, loadBlankSettings } from '@/core/broadcastSync';
import { useStateManager } from '@/core/stateManager';
import { Monitor, ExternalLink, Wifi, WifiOff, MonitorUp, Maximize, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type ProjectionStatus = 'idle' | 'connecting' | 'active' | 'disconnected';

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
    projectorWindowRef.current = window.open(
      '/projection',
      'projectionWindow',
      'width=1280,height=720'
    );

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
              status === 'active' && 'bg-green-500',
              status === 'connecting' && 'bg-yellow-500 animate-pulse',
              status === 'disconnected' && 'bg-destructive',
              status === 'idle' && 'bg-muted-foreground/40'
            )}
          />
          <span className="hidden sm:inline">
            {status === 'active' && 'Connected'}
            {status === 'connecting' && 'Connecting…'}
            {status === 'disconnected' && 'Disconnected'}
            {status === 'idle' && 'Not started'}
          </span>
        </div>

        <Button
          variant={config.variant}
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={startProjection}
          disabled={config.disabled}
        >
          <Icon className="h-3.5 w-3.5" />
          {config.label}
        </Button>
      </div>

      {/* Setup Guide Dialog */}
      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
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
                  <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <StepIcon className="h-4 w-4 text-primary" />
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
