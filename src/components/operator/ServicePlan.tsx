import { useState, useEffect, useCallback } from 'react';
import { useStateManager } from '@/core/stateManager';
import { BibleRepository } from '@/core/bibleRepository';
import { cn } from '@/lib/utils';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Play, SkipForward,
  ArrowLeft, Copy, Pencil, Check, X, FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


export interface ServicePlanItem {
  id: string;
  label: string;
  reference: string;
}

export interface Service {
  id: string;
  name: string;
  passages: ServicePlanItem[];
}

const STORAGE_KEY = 'services';

function loadServices(): Service[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const old = localStorage.getItem('servicePlan');
    if (old) {
      const passages: ServicePlanItem[] = JSON.parse(old);
      if (passages.length > 0) {
        const migrated: Service[] = [{ id: Date.now().toString(), name: 'Service Plan', passages }];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        localStorage.removeItem('servicePlan');
        return migrated;
      }
    }
    return [];
  } catch {
    return [];
  }
}

function saveServices(s: Service[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function ServicePlan() {
  const [services, setServices] = useState<Service[]>(loadServices);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [activePassageIndex, setActivePassageIndex] = useState<number | null>(null);

  // Form state
  const [showPassageForm, setShowPassageForm] = useState(false);
  const [label, setLabel] = useState('');
  const [reference, setReference] = useState('');

  // New service form
  const [showNewService, setShowNewService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Edit passage state
  const [editingPassageIdx, setEditingPassageIdx] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editReference, setEditReference] = useState('');

  // Delete confirmation state
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

  const { buildQueueFromPassage, buildQueueFromChapter, currentTranslation } = useStateManager();

  useEffect(() => { saveServices(services); }, [services]);

  const activeService = services.find(s => s.id === activeServiceId) || null;

  // --- Passage loading ---
  const loadPassageAtIndex = useCallback((index: number, passages?: ServicePlanItem[]) => {
    const list = passages || activeService?.passages;
    if (!list || index < 0 || index >= list.length) return;
    const item = list[index];
    setActivePassageIndex(index);

    const rangePattern = /^(.+?)\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/i;
    const chapterPattern = /^(.+?)\s*(\d+)$/i;

    const rangeMatch = item.reference.match(rangePattern);
    if (rangeMatch) {
      const [, bookPart, chapter, verseStart, verseEnd] = rangeMatch;
      const bookName = BibleRepository.resolveBookName(bookPart.trim());
      if (!bookName) return;
      const passage = BibleRepository.getPassage({ book: bookName, chapter, verseStart, verseEnd, translation: currentTranslation });
      if (passage) buildQueueFromPassage(passage);
      return;
    }

    const chapterMatch = item.reference.match(chapterPattern);
    if (chapterMatch) {
      const [, bookPart, chapter] = chapterMatch;
      const bookName = BibleRepository.resolveBookName(bookPart.trim());
      if (!bookName) return;
      buildQueueFromChapter(bookName, chapter);
    }
  }, [activeService, buildQueueFromPassage, buildQueueFromChapter]);

  const nextPassage = useCallback(() => {
    if (!activeService) return;
    const nextIndex = activePassageIndex === null ? 0 : activePassageIndex + 1;
    if (nextIndex < activeService.passages.length) {
      loadPassageAtIndex(nextIndex);
    }
  }, [activePassageIndex, activeService, loadPassageAtIndex]);

  useEffect(() => {
    const handler = () => nextPassage();
    window.addEventListener('nextServicePlanPassage', handler);
    return () => window.removeEventListener('nextServicePlanPassage', handler);
  }, [nextPassage]);

  // --- Service CRUD ---
  const createService = useCallback(() => {
    const name = newServiceName.trim();
    if (!name) return;
    const newSvc: Service = { id: Date.now().toString(), name, passages: [] };
    setServices(prev => [...prev, newSvc]);
    setActiveServiceId(newSvc.id);
    setNewServiceName('');
    setShowNewService(false);
  }, [newServiceName]);

  const deleteService = useCallback((id: string) => {
    setServices(prev => prev.filter(s => s.id !== id));
    if (activeServiceId === id) { setActiveServiceId(null); setActivePassageIndex(null); }
  }, [activeServiceId]);

  const duplicateService = useCallback((svc: Service) => {
    const dup: Service = {
      id: Date.now().toString(),
      name: `${svc.name} (Copy)`,
      passages: svc.passages.map(p => ({ ...p, id: `${Date.now()}-${Math.random()}` })),
    };
    setServices(prev => [...prev, dup]);
  }, []);

  const confirmRename = useCallback(() => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    setServices(prev => prev.map(s => s.id === renamingId ? { ...s, name: renameValue.trim() } : s));
    setRenamingId(null);
  }, [renamingId, renameValue]);

  // --- Passage CRUD (scoped to active service) ---
  const updateActivePassages = useCallback((fn: (p: ServicePlanItem[]) => ServicePlanItem[]) => {
    if (!activeServiceId) return;
    setServices(prev => prev.map(s => s.id === activeServiceId ? { ...s, passages: fn(s.passages) } : s));
  }, [activeServiceId]);

  const addPassage = useCallback(() => {
    const ref = reference.trim();
    if (!ref) return;
    const newItem: ServicePlanItem = { id: Date.now().toString(), label: label.trim() || ref, reference: ref };
    updateActivePassages(p => [...p, newItem]);
    setLabel('');
    setReference('');
    setShowPassageForm(false);
  }, [label, reference, updateActivePassages]);

  const removePassage = useCallback((index: number) => {
    updateActivePassages(p => p.filter((_, i) => i !== index));
    if (activePassageIndex === index) setActivePassageIndex(null);
    else if (activePassageIndex !== null && activePassageIndex > index) setActivePassageIndex(activePassageIndex - 1);
    setDeleteConfirmIdx(null);
  }, [activePassageIndex, updateActivePassages]);

  const startEditPassage = useCallback((idx: number) => {
    if (!activeService) return;
    const item = activeService.passages[idx];
    setEditingPassageIdx(idx);
    setEditLabel(item.label);
    setEditReference(item.reference);
  }, [activeService]);

  const saveEditPassage = useCallback(() => {
    if (editingPassageIdx === null) return;
    const ref = editReference.trim();
    if (!ref) return;
    updateActivePassages(p => p.map((item, i) =>
      i === editingPassageIdx ? { ...item, label: editLabel.trim() || ref, reference: ref } : item
    ));
    setEditingPassageIdx(null);
  }, [editingPassageIdx, editLabel, editReference, updateActivePassages]);

  const movePassage = useCallback((index: number, dir: 'up' | 'down') => {
    updateActivePassages(prev => {
      const newIdx = dir === 'up' ? index - 1 : index + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[newIdx]] = [next[newIdx], next[index]];
      if (activePassageIndex === index) setActivePassageIndex(newIdx);
      else if (activePassageIndex === newIdx) setActivePassageIndex(index);
      return next;
    });
  }, [activePassageIndex, updateActivePassages]);

  const isAtEnd = activeService && activePassageIndex !== null && activePassageIndex >= activeService.passages.length - 1;

  // ======== SERVICE LIST VIEW ========
  if (!activeServiceId) {
    return (
      <div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-medium text-foreground">Services</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowNewService(!showNewService)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {showNewService && (
          <div className="p-3 border-b border-border space-y-2 shrink-0">
            <Input
              placeholder="Service name (e.g. Sunday Morning)"
              value={newServiceName}
              onChange={e => setNewServiceName(e.target.value)}
              className="h-8 text-xs"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); createService(); } }}
              autoFocus
            />
            <Button onClick={createService} size="sm" className="w-full h-7 text-xs">Create Service</Button>
          </div>
        )}

        <div>
          {services.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground font-medium mb-1">No services yet</p>
              <p className="text-[11px] text-muted-foreground/70">Click <Plus className="inline h-3 w-3" /> to create one</p>
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {services.map(svc => (
                <div key={svc.id} className="group rounded-md border border-border hover:bg-accent/50 transition-colors">
                  {renamingId === svc.id ? (
                    <div className="flex items-center gap-1 px-2.5 py-2">
                      <Input
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        className="h-6 text-xs flex-1"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmRename(); } if (e.key === 'Escape') setRenamingId(null); }}
                        autoFocus
                      />
                      <button onClick={confirmRename} className="p-0.5 rounded hover:bg-accent"><Check className="h-3 w-3 text-primary" /></button>
                      <button onClick={() => setRenamingId(null)} className="p-0.5 rounded hover:bg-accent"><X className="h-3 w-3 text-muted-foreground" /></button>
                    </div>
                  ) : (
                    <div
                      className="flex items-start gap-2 px-2.5 py-2 cursor-pointer"
                      onClick={() => { setActiveServiceId(svc.id); setActivePassageIndex(null); }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{svc.name}</p>
                        <p className="text-[11px] text-muted-foreground">{svc.passages.length} passage{svc.passages.length !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={e => { e.stopPropagation(); setRenamingId(svc.id); setRenameValue(svc.name); }} className="p-0.5 rounded hover:bg-accent" title="Rename">
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); duplicateService(svc); }} className="p-0.5 rounded hover:bg-accent" title="Duplicate">
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteService(svc.id); }} className="p-0.5 rounded hover:bg-destructive/20" title="Delete">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ======== PASSAGE LIST VIEW (inside a service) ========
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button onClick={() => { setActiveServiceId(null); setActivePassageIndex(null); }} className="p-0.5 rounded hover:bg-accent shrink-0">
            <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <span className="text-xs font-medium text-foreground truncate">{activeService?.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 gap-1 text-[11px]" onClick={nextPassage} disabled={!activeService || activeService.passages.length === 0 || !!isAtEnd} title="Next Passage (Shift+Enter)">
            <SkipForward className="h-3 w-3" /> Next
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowPassageForm(!showPassageForm)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Add passage form */}
      {showPassageForm && (
        <div className="p-3 border-b border-border space-y-2 shrink-0">
          <Input placeholder="Label (e.g. Scripture Reading)" value={label} onChange={e => setLabel(e.target.value)} className="h-8 text-xs" />
          <Input
            placeholder="Reference (e.g. Romans 8:28-31)"
            value={reference}
            onChange={e => setReference(e.target.value)}
            className="h-8 text-xs"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addPassage(); } }}
          />
          <Button onClick={addPassage} size="sm" className="w-full h-7 text-xs">Add to Plan</Button>
        </div>
      )}

      {/* Passages */}
      <div>
        {activeService && activeService.passages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <p className="text-xs text-muted-foreground font-medium mb-1">No passages added</p>
            <p className="text-[11px] text-muted-foreground/70">Click <Plus className="inline h-3 w-3" /> to add passages</p>
          </div>
        ) : (
          <div className="p-1.5 space-y-1">
            {activeService?.passages.map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  'group rounded-md border transition-colors',
                  activePassageIndex === idx ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50'
                )}
              >
                {editingPassageIdx === idx ? (
                  /* Inline edit form */
                  <div className="px-2.5 py-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                    <Input
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      placeholder="Label"
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); saveEditPassage(); } if (e.key === 'Escape') setEditingPassageIdx(null); }}
                    />
                    <Input
                      value={editReference}
                      onChange={e => setEditReference(e.target.value)}
                      placeholder="Reference"
                      className="h-7 text-xs"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); saveEditPassage(); } if (e.key === 'Escape') setEditingPassageIdx(null); }}
                    />
                    <div className="flex gap-1">
                      <Button onClick={saveEditPassage} size="sm" className="h-6 text-[11px] flex-1 gap-1">
                        <Check className="h-3 w-3" /> Save
                      </Button>
                      <Button onClick={() => setEditingPassageIdx(null)} variant="ghost" size="sm" className="h-6 text-[11px] flex-1 gap-1">
                        <X className="h-3 w-3" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 px-2.5 py-2 cursor-pointer" onClick={() => loadPassageAtIndex(idx)}>
                    <div className="mt-0.5 shrink-0">
                      {activePassageIndex === idx ? (
                        <Play className="h-3 w-3 text-primary fill-primary" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono w-3 inline-block text-center">{idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{item.reference}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={e => { e.stopPropagation(); startEditPassage(idx); }} className="p-0.5 rounded hover:bg-accent" title="Edit">
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); movePassage(idx, 'up'); }} disabled={idx === 0} className="p-0.5 rounded hover:bg-accent disabled:opacity-30">
                        <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); movePassage(idx, 'down'); }} disabled={idx === activeService!.passages.length - 1} className="p-0.5 rounded hover:bg-accent disabled:opacity-30">
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirmIdx(idx); }} className="p-0.5 rounded hover:bg-destructive/20" title="Delete">
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isAtEnd && (
              <p className="text-[11px] text-muted-foreground/60 text-center py-2 italic">End of Service Plan</p>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmIdx !== null} onOpenChange={open => { if (!open) setDeleteConfirmIdx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Passage</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this passage from the Service Plan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteConfirmIdx !== null) removePassage(deleteConfirmIdx); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
