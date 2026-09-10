import { useStateManager } from '@/core/stateManager';
import { cn } from '@/lib/utils';

export function ProjectionStatus() {
  const { isScreenBlanked, projectionLocked, liveSlideIndex } = useStateManager();

  const status = isScreenBlanked
    ? { label: 'Blank', color: 'bg-muted-foreground', textColor: 'text-muted-foreground' }
    : projectionLocked
      ? { label: 'Locked', color: 'bg-yellow-500', textColor: 'text-yellow-600' }
      : liveSlideIndex !== null
        ? { label: 'Live', color: 'bg-green-500', textColor: 'text-green-600' }
        : { label: 'Idle', color: 'bg-muted-foreground', textColor: 'text-muted-foreground' };

  return (
    <div className={cn('flex items-center gap-1.5 text-xs font-medium', status.textColor)}>
      <span className={cn('h-2 w-2 rounded-full', status.color, status.label === 'Live' && 'animate-pulse')} />
      {status.label}
    </div>
  );
}
