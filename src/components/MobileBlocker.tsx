import { Monitor } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export function MobileBlocker({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center max-w-sm space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Monitor className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Screen Not Supported</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This application is designed for larger screens. Please use a tablet, laptop, or desktop device for the best experience.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
