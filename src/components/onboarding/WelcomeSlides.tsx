import { useState } from 'react';
import { Search, Monitor, ArrowLeftRight, ListChecks, SlidersHorizontal, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

const slides = [
  {
    icon: Search,
    title: 'Find any Bible verse instantly',
    description: 'Type "John 3:16" or browse through books and chapters.',
  },
  {
    icon: Monitor,
    title: 'Project verses to the screen',
    description: 'Selecting a verse displays it immediately — no extra steps.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Move through verses effortlessly',
    description: 'Use arrow keys or on-screen controls to navigate.',
  },
  {
    icon: ListChecks,
    title: 'Prepare your service ahead of time',
    description: 'Save passages in a service plan and move through them during the service.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Control what the audience sees',
    description: 'Blank the screen, add backgrounds, and adjust display settings.',
  },
  {
    icon: Rocket,
    title: "You're ready",
    description: 'Everything runs offline. Start using the app and learn as you go.',
  },
];

interface WelcomeSlidesProps {
  onComplete: () => void;
}

export function WelcomeSlides({ onComplete }: WelcomeSlidesProps) {
  const [current, setCurrent] = useState(0);
  const isLast = current === slides.length - 1;
  const slide = slides[current];
  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
      <div className="max-w-md w-full mx-4 text-center space-y-8">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
          <Icon className="h-8 w-8 text-primary" />
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">{slide.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{slide.description}</p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === current ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
              )}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          {!isLast && (
            <button
              onClick={onComplete}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={() => (isLast ? onComplete() : setCurrent(current + 1))}
            className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {isLast ? 'Start Using App' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
