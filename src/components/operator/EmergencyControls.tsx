import { useStateManager } from '@/core/stateManager';
import { Button } from '@/components/ui/button';
import { EyeOff, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmergencyControls() {
  const {
    blankScreen,
    isScreenBlanked,
    undoProjection,
    historyStack,
  } = useStateManager();

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-destructive/20 bg-destructive/5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive mr-1">
        Emergency
      </span>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          'h-7 px-2 text-xs gap-1 border-destructive/30',
          isScreenBlanked && 'bg-destructive text-destructive-foreground'
        )}
        onClick={blankScreen}
        title="Blank screen (B)"
      >
        <EyeOff className="h-3 w-3" />
        {isScreenBlanked ? 'Unblank' : 'Blank'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs gap-1 border-destructive/30"
        onClick={undoProjection}
        disabled={historyStack.length === 0}
        title="Undo last projection (Ctrl+Z)"
      >
        <Undo2 className="h-3 w-3" />
        Undo
      </Button>
    </div>
  );
}
