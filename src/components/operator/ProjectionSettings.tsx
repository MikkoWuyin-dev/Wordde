import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Monitor,
  Image as ImageIcon,
  Church,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  Pencil,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ImageUpload } from './ImageUpload';
import {
  type BlankStyle,
  type BlankSettings,
  type SessionScreen,
  type BackgroundImageRef,
  loadBlankSettings,
  saveBlankSettings,
  broadcastReloadAssets,
} from '@/core/broadcastSync';
import {
  saveAsset,
  deleteAsset,
  loadAllAssets,
  newBackgroundKey,
  MAX_BACKGROUNDS,
} from '@/core/assetStorage';

type View = 'main' | 'sessionScreens' | 'backgroundImages';

const STYLE_OPTIONS: { value: BlankStyle; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'black', label: 'Black Screen', icon: Monitor, desc: 'Solid black' },
  { value: 'logo', label: 'Church Logo', icon: Church, desc: 'Centered logo' },
  { value: 'soft', label: 'Soft Background', icon: ImageIcon, desc: 'Image background' },
  { value: 'session', label: 'Session Screen', icon: MessageSquare, desc: 'Title + subtitle' },
];

function genId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${uuid.slice(0, 8)}`;
}

export function ProjectionSettings() {
  const [view, setView] = useState<View>('main');
  const [settings, setSettings] = useState<BlankSettings>(loadBlankSettings);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAllAssets().then(setAssetUrls);
  }, []);

  const update = useCallback((partial: Partial<BlankSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      saveBlankSettings(next);
      return next;
    });
  }, []);

  // -------- Logo (single asset) --------
  const handleLogoUpload = useCallback(async (file: File) => {
    await saveAsset('logo', file);
    const url = URL.createObjectURL(file);
    setAssetUrls(prev => {
      if (prev.logo) URL.revokeObjectURL(prev.logo);
      return { ...prev, logo: url };
    });
    broadcastReloadAssets();
  }, []);

  const handleLogoRemove = useCallback(async () => {
    await deleteAsset('logo');
    setAssetUrls(prev => {
      if (prev.logo) URL.revokeObjectURL(prev.logo);
      return { ...prev, logo: '' };
    });
    broadcastReloadAssets();
  }, []);

  // -------- Backgrounds (multi, max 7) --------
  const backgrounds = settings.backgrounds;
  const atLimit = backgrounds.length >= MAX_BACKGROUNDS;

  const handleBackgroundUpload = useCallback(
    async (file: File) => {
      if (settings.backgrounds.length >= MAX_BACKGROUNDS) return;
      const id = newBackgroundKey();
      await saveAsset(id, file);
      const url = URL.createObjectURL(file);
      setAssetUrls(prev => ({ ...prev, [id]: url }));
      const ref: BackgroundImageRef = {
        id,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Background',
        createdAt: Date.now(),
      };
      // Auto-activate if first one
      const nextActive = settings.activeBackgroundId || id;
      update({
        backgrounds: [...settings.backgrounds, ref],
        activeBackgroundId: nextActive,
      });
      broadcastReloadAssets();
    },
    [settings.backgrounds, settings.activeBackgroundId, update]
  );

  const handleBackgroundDelete = useCallback(
    async (id: string) => {
      await deleteAsset(id);
      setAssetUrls(prev => {
        if (prev[id]) URL.revokeObjectURL(prev[id]);
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const remaining = settings.backgrounds.filter(b => b.id !== id);
      const nextActive =
        settings.activeBackgroundId === id ? remaining[0]?.id ?? '' : settings.activeBackgroundId;
      update({ backgrounds: remaining, activeBackgroundId: nextActive });
      broadcastReloadAssets();
    },
    [settings.backgrounds, settings.activeBackgroundId, update]
  );

  const selectBackground = useCallback(
    (id: string) => update({ activeBackgroundId: id }),
    [update]
  );

  // -------- Session screens (CRUD) --------
  const addSession = useCallback(() => {
    const screen: SessionScreen = { id: genId('session'), title: 'New Screen', subtitle: '' };
    update({
      sessionScreens: [...settings.sessionScreens, screen],
      activeSessionId: settings.activeSessionId || screen.id,
    });
  }, [settings.sessionScreens, settings.activeSessionId, update]);

  const updateSession = useCallback(
    (id: string, field: keyof Omit<SessionScreen, 'id'>, value: string) => {
      update({
        sessionScreens: settings.sessionScreens.map(s =>
          s.id === id ? { ...s, [field]: value } : s
        ),
      });
    },
    [settings.sessionScreens, update]
  );

  const deleteSession = useCallback(
    (id: string) => {
      const remaining = settings.sessionScreens.filter(s => s.id !== id);
      const nextActive =
        settings.activeSessionId === id ? remaining[0]?.id ?? '' : settings.activeSessionId;
      update({ sessionScreens: remaining, activeSessionId: nextActive });
    },
    [settings.sessionScreens, settings.activeSessionId, update]
  );

  // Header (back nav)
  const Header = useMemo(() => {
    if (view === 'main') {
      return (
        <div className="px-1 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Display Settings</h3>
        </div>
      );
    }
    const titles: Record<Exclude<View, 'main'>, string> = {
      sessionScreens: 'Session Screens',
      backgroundImages: 'Background Images',
    };
    return (
      <div className="flex items-center gap-2 pb-2">
        <button
          onClick={() => setView('main')}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors -ml-1 px-1 py-0.5 rounded hover:bg-accent/20"
          aria-label="Back to display settings"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <h3 className="text-sm font-semibold text-foreground">{titles[view]}</h3>
      </div>
    );
  }, [view]);

  return (
    // Fills parent (PopoverContent) which is the single viewport-bound shell.
    // Header is non-scrollable; only the content area owns vertical overflow.
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="shrink-0 px-3 pt-3">{Header}</div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-6">
        {view === 'main' && (
          <MainView
            settings={settings}
            update={update}
            assetUrls={assetUrls}
            onLogoUpload={handleLogoUpload}
            onLogoRemove={handleLogoRemove}
            openSessionScreens={() => setView('sessionScreens')}
            openBackgroundImages={() => setView('backgroundImages')}
          />
        )}

        {view === 'sessionScreens' && (
          <SessionScreensView
            screens={settings.sessionScreens}
            activeId={settings.activeSessionId}
            onSelect={(id) => update({ activeSessionId: id })}
            onAdd={addSession}
            onUpdate={updateSession}
            onDelete={deleteSession}
          />
        )}

        {view === 'backgroundImages' && (
          <BackgroundImagesView
            backgrounds={backgrounds}
            activeId={settings.activeBackgroundId}
            assetUrls={assetUrls}
            atLimit={atLimit}
            onUpload={handleBackgroundUpload}
            onDelete={handleBackgroundDelete}
            onSelect={selectBackground}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Main view ──────────────────────────────────────────────────────────── */

function MainView({
  settings,
  update,
  assetUrls,
  onLogoUpload,
  onLogoRemove,
  openSessionScreens,
  openBackgroundImages,
}: {
  settings: BlankSettings;
  update: (p: Partial<BlankSettings>) => void;
  assetUrls: Record<string, string>;
  onLogoUpload: (f: File) => void;
  onLogoRemove: () => void;
  openSessionScreens: () => void;
  openBackgroundImages: () => void;
}) {
  const activeBg = settings.backgrounds.find(b => b.id === settings.activeBackgroundId);
  const activeSession = settings.sessionScreens.find(s => s.id === settings.activeSessionId);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Blank Screen Style
        </label>
        <div className="space-y-1">
          {STYLE_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const active = settings.style === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => update({ style: opt.value })}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors',
                  active
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-accent/10 border border-transparent'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0">
                  <p className={cn('text-xs font-medium', active ? 'text-primary' : 'text-foreground')}>{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {(settings.style === 'logo' || settings.style === 'session') && (
        <ImageUpload
          label="Church Logo"
          currentUrl={assetUrls.logo || ''}
          onUpload={onLogoUpload}
          onRemove={onLogoRemove}
        />
      )}

      {settings.style === 'soft' && (
        <SubmenuRow
          label="Background Images"
          value={
            activeBg
              ? `${activeBg.name} • ${settings.backgrounds.length}/${MAX_BACKGROUNDS}`
              : settings.backgrounds.length > 0
                ? `${settings.backgrounds.length}/${MAX_BACKGROUNDS} uploaded`
                : 'None — tap to upload'
          }
          onClick={openBackgroundImages}
        />
      )}

      {settings.style === 'session' && (
        <SubmenuRow
          label="Session Screens"
          value={
            activeSession
              ? `Active: ${activeSession.title}`
              : `${settings.sessionScreens.length} screen${settings.sessionScreens.length === 1 ? '' : 's'}`
          }
          onClick={openSessionScreens}
        />
      )}
    </div>
  );
}

function SubmenuRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border border-border hover:border-muted-foreground/40 hover:bg-accent/10 transition-colors text-left"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xs text-foreground truncate">{value}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

/* ─── Session screens view ───────────────────────────────────────────────── */

function SessionScreensView({
  screens,
  activeId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: {
  screens: SessionScreen[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onUpdate: (id: string, field: keyof Omit<SessionScreen, 'id'>, value: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        onClick={onAdd}
        className="w-full h-8 text-xs gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Session Screen
      </Button>

      {screens.length === 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-4">
          No session screens yet. Add one to get started.
        </p>
      )}

      <div className="space-y-1.5">
        {screens.map(screen => {
          const isActive = activeId === screen.id;
          const isEditing = editingId === screen.id;
          const isConfirming = confirmDeleteId === screen.id;
          return (
            <div
              key={screen.id}
              className={cn(
                'rounded-md border p-2 space-y-1.5 transition-colors',
                isActive ? 'border-primary/40 bg-primary/5' : 'border-border'
              )}
            >
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onSelect(screen.id)}
                  className="flex-1 min-w-0 text-left"
                  title="Set as active session screen"
                >
                  <span
                    className={cn(
                      'text-xs font-medium truncate block',
                      isActive ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {isActive ? '▶ ' : ''}
                    {screen.title || 'Untitled'}
                  </span>
                  {screen.subtitle && (
                    <span className="text-[10px] text-muted-foreground truncate block">
                      {screen.subtitle}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setEditingId(isEditing ? null : screen.id)}
                  className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground"
                  aria-label="Edit"
                  title="Edit"
                >
                  {isEditing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => setConfirmDeleteId(isConfirming ? null : screen.id)}
                  className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              {isConfirming && (
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[10px] text-muted-foreground">Delete this screen?</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        if (editingId === screen.id) setEditingId(null);
                        onDelete(screen.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}

              {isEditing && (
                <div className="space-y-1">
                  <Input
                    value={screen.title}
                    onChange={e => onUpdate(screen.id, 'title', e.target.value)}
                    placeholder="Title"
                    className="h-7 text-xs"
                  />
                  <Input
                    value={screen.subtitle}
                    onChange={e => onUpdate(screen.id, 'subtitle', e.target.value)}
                    placeholder="Subtitle (optional)"
                    className="h-7 text-xs"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Background images view ─────────────────────────────────────────────── */

function BackgroundImagesView({
  backgrounds,
  activeId,
  assetUrls,
  atLimit,
  onUpload,
  onDelete,
  onSelect,
}: {
  backgrounds: BackgroundImageRef[];
  activeId: string;
  assetUrls: Record<string, string>;
  atLimit: boolean;
  onUpload: (f: File) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {backgrounds.length}/{MAX_BACKGROUNDS} uploaded
        </p>
        {atLimit && (
          <p className="text-[10px] text-destructive">Maximum reached</p>
        )}
      </div>

      {!atLimit ? (
        <ImageUpload
          label="Upload Background"
          currentUrl=""
          onUpload={onUpload}
          onRemove={() => {}}
        />
      ) : (
        <div className="px-3 py-2 rounded-md border border-dashed border-border bg-muted/20 text-center">
          <p className="text-[11px] text-muted-foreground">
            Delete an image to upload a new one.
          </p>
        </div>
      )}

      {backgrounds.length === 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-2">
          No backgrounds uploaded yet.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {backgrounds.map(bg => {
          const isActive = activeId === bg.id;
          const url = assetUrls[bg.id];
          return (
            <div
              key={bg.id}
              className={cn(
                'relative rounded-md border overflow-hidden group transition-colors',
                isActive ? 'border-primary ring-1 ring-primary' : 'border-border'
              )}
            >
              <button
                onClick={() => onSelect(bg.id)}
                className="block w-full"
                title={isActive ? 'Active background' : 'Set as active'}
              >
                {url ? (
                  <img src={url} alt={bg.name} className="w-full h-20 object-cover" />
                ) : (
                  <div className="w-full h-20 bg-muted/40 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                )}
                <div className="px-1.5 py-1 bg-background/80 text-left">
                  <p className="text-[10px] text-foreground truncate">{bg.name}</p>
                </div>
              </button>

              {isActive && (
                <span className="absolute top-1 left-1 p-0.5 rounded bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}

              <button
                onClick={() => onDelete(bg.id)}
                className="absolute top-1 right-1 p-1 rounded bg-background/80 hover:bg-destructive/20 transition-colors opacity-0 group-hover:opacity-100"
                aria-label="Delete background"
                title="Delete"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
