import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { onBroadcastMessage, requestCurrentState, broadcastHeartbeat, loadPersistedProjectionState, getChannel } from '@/core/broadcastSync';
import type { BlankSettings, SessionScreen } from '@/core/broadcastSync';
import type { Passage } from '@/core/types';
import { loadAllAssets } from '@/core/assetStorage';
import { getTranslationDisplayName } from '@/core/translationMetadata';

function BlankOverlay({ settings, assetUrls }: { settings: BlankSettings; assetUrls: Record<string, string> }) {
  const session = settings.sessionScreens.find(s => s.id === settings.activeSessionId);
  const logoSrc = assetUrls.logo || settings.logoUrl;
  const activeBgUrl = settings.activeBackgroundId ? assetUrls[settings.activeBackgroundId] : '';
  const bgSrc = activeBgUrl || assetUrls.softBackground || settings.softBgUrl;

  switch (settings.style) {
    case 'logo':
      return (
        <div className="min-h-screen flex items-center justify-center bg-projection p-16">
          {logoSrc ? (
            <img src={logoSrc} alt="Church Logo" className="max-w-md max-h-[50vh] object-contain opacity-80" />
          ) : (
            <p className="text-projection-foreground/30 text-2xl font-sans">No logo configured</p>
          )}
        </div>
      );
    case 'soft':
      return (
        <div
          className="min-h-screen"
          style={{
            background: bgSrc
              ? `url(${bgSrc}) center/cover no-repeat`
              : 'linear-gradient(135deg, hsl(222 47% 14%), hsl(215 25% 22%))',
          }}
        />
      );
    case 'session':
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-projection p-16 text-center gap-6">
          {logoSrc && (
            <img src={logoSrc} alt="" className="max-w-[200px] max-h-[120px] object-contain opacity-60 mb-4" />
          )}
          <h2 className="text-projection-foreground text-5xl md:text-7xl font-serif font-medium tracking-wide">
            {session?.title || 'Service'}
          </h2>
          {session?.subtitle && (
            <p className="text-projection-foreground/60 text-2xl md:text-3xl font-sans font-light tracking-wider">
              {session.subtitle}
            </p>
          )}
        </div>
      );
    default:
      return <div className="min-h-screen bg-projection" />;
  }
}

function AutoFitVerse({ passage }: { passage: Passage }) {
  const verseBoundsRef = useRef<HTMLDivElement>(null);
  const verseTextRef = useRef<HTMLDivElement>(null);

  const verseContent = passage.verses.map(v => v.text).join(' ');
  const reference = passage.displayReference;
  const translationCode = passage.reference.translation;
  const translationName = getTranslationDisplayName(translationCode);

  useLayoutEffect(() => {
    const fit = () => {
      const container = verseBoundsRef.current;
      const text = verseTextRef.current;
      if (!container || !text) return;

      const MAX_FONT_SIZE = 72;
      const MIN_FONT_SIZE = 16;
      const STEP = 2;

      let currentSize = MAX_FONT_SIZE;
      text.style.fontSize = currentSize + 'px';

      while (
        (text.scrollHeight > container.clientHeight || text.scrollWidth > container.clientWidth) &&
        currentSize > MIN_FONT_SIZE
      ) {
        currentSize -= STEP;
        text.style.fontSize = currentSize + 'px';
      }
    };

    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [verseContent, reference]);

  return (
    <div
      className="h-screen w-screen flex flex-col"
      style={{ padding: '2rem' }}
    >
      {/* VerseContainer — flexes to fill available space.
          ONLY this region participates in auto-fit measurement. */}
      <div
        ref={verseBoundsRef}
        className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
      >
        <div
          ref={verseTextRef}
          className="text-center"
          style={{ maxWidth: '70%' }}
        >
          <blockquote className="font-serif leading-relaxed tracking-wide text-projection-foreground m-0">
            {passage.verses.map((verse, index) => (
              <span key={verse.verse}>
                {passage.verses.length > 1 && (
                  <sup className="opacity-50 mr-1" style={{ fontSize: '0.35em' }}>{verse.verse}</sup>
                )}
                {verse.text}
                {index < passage.verses.length - 1 && ' '}
              </span>
            ))}
          </blockquote>
        </div>
      </div>

      {/* MetaContainer — fixed layout, OUTSIDE auto-fit bounds.
          Reserved space prevents overlap and ensures consistent spacing
          regardless of verse length. */}
      <div className="shrink-0 flex flex-col items-center gap-2 pt-6 pb-2">
        <p className="font-sans font-medium tracking-widest uppercase text-projection-foreground/70 text-base md:text-lg m-0">
          {reference}
        </p>
        <p className="font-sans font-light tracking-wider uppercase text-projection-foreground/40 text-xs md:text-sm m-0">
          {translationName}
        </p>
      </div>
    </div>
  );
}

const Projection = () => {
  const [passage, setPassage] = useState<Passage | null>(null);
  const [isBlanked, setIsBlanked] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [blankSettings, setBlankSettings] = useState<BlankSettings>({
    style: 'black',
    logoUrl: '',
    softBgUrl: '',
    sessionScreens: [],
    activeSessionId: '',
    backgrounds: [],
    activeBackgroundId: '',
  });
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  // Load persisted state immediately on mount (refresh-safe)
  useEffect(() => {
    console.log('Projection tab loaded');
    loadAllAssets().then(setAssetUrls);

    const saved = localStorage.getItem('currentProjection');
    console.log('Loaded from localStorage:', saved);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Passage;
        setPassage(parsed);
        setIsBlanked(false);
        console.log('Rendering saved projection');
      } catch {
        console.log('No saved projection found');
      }
    } else {
      console.log('No saved projection found');
    }

    const persisted = loadPersistedProjectionState();
    if (persisted) {
      setPassage(persisted.passage);
      setIsBlanked(persisted.isBlanked);
      if (persisted.blankSettings) setBlankSettings(persisted.blankSettings);
    }

    const timer = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Heartbeat + announce ready
  useEffect(() => {
    // Send PROJECTOR_READY immediately so operator knows we're alive
    getChannel().postMessage({ type: 'PROJECTOR_READY' });
    broadcastHeartbeat();
    const interval = setInterval(broadcastHeartbeat, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const channel = getChannel();
    const broadcastLogger: NonNullable<BroadcastChannel['onmessage']> = (event) => {
      console.log('Received broadcast:', event.data);
    };
    channel.onmessage = broadcastLogger;

    const unsub = onBroadcastMessage((msg) => {
      if (msg.type === 'COMMIT_PASSAGE') {
        setPassage(msg.payload);
        setIsBlanked(false);
      } else if (msg.type === 'CLEAR_PASSAGE') {
        setPassage(null);
      } else if (msg.type === 'BLANK_SCREEN') {
        setIsBlanked(true);
        if (msg.payload) setBlankSettings(msg.payload);
      } else if (msg.type === 'UNBLANK_SCREEN') {
        setIsBlanked(false);
      } else if (msg.type === 'STATE_RESPONSE') {
        setPassage(msg.payload);
      } else if (msg.type === 'SYNC') {
        setPassage(msg.payload);
        setIsBlanked(msg.isBlanked);
        if (msg.blankSettings) setBlankSettings(msg.blankSettings);
      } else if (msg.type === 'RELOAD_ASSETS') {
        Object.values(assetUrls).forEach(u => { if (u) URL.revokeObjectURL(u); });
        loadAllAssets().then(setAssetUrls);
      }
    });

    requestCurrentState();
    return () => {
      if (channel.onmessage === broadcastLogger) channel.onmessage = null;
      unsub();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-projection text-projection-foreground cursor-none select-none relative">
      {isBlanked ? (
        <BlankOverlay settings={blankSettings} assetUrls={assetUrls} />
      ) : passage ? (
        <AutoFitVerse passage={passage} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground/30 text-2xl font-sans select-none">
            Waiting for passage…
          </div>
        </div>
      )}
      {showHint && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-foreground/10 backdrop-blur-sm text-projection-foreground/60 text-sm font-sans animate-pulse select-none pointer-events-none">
          Press F11 for fullscreen projection
        </div>
      )}
    </div>
  );
};

export default Projection;
