import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateImageFile } from '@/core/assetStorage';

interface ImageUploadProps {
  label: string;
  currentUrl: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export function ImageUpload({ label, currentUrl, onUpload, onRemove }: ImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    const err = validateImageFile(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onUpload(file);
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }, [handleFile]);

  if (currentUrl) {
    return (
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
          {label}
        </label>
        <div className="relative rounded-md border border-border overflow-hidden bg-muted/30">
          <img
            src={currentUrl}
            alt={label}
            className="w-full h-24 object-contain bg-background/50 p-2"
          />
          <button
            onClick={onRemove}
            className="absolute top-1 right-1 p-1 rounded-md bg-background/80 hover:bg-destructive/20 transition-colors"
            title="Remove image"
          >
            <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-[10px] text-primary hover:underline cursor-pointer"
        >
          Replace Image
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
        {label}
      </label>
      <div
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 px-3 py-4 rounded-md border-2 border-dashed cursor-pointer transition-colors',
          isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/20'
        )}
      >
        {isDragOver ? (
          <ImageIcon className="h-5 w-5 text-primary" />
        ) : (
          <Upload className="h-5 w-5 text-muted-foreground/60" />
        )}
        <span className="text-[11px] text-muted-foreground text-center">
          {isDragOver ? 'Drop image here' : 'Drag image here or click to upload'}
        </span>
        <span className="text-[9px] text-muted-foreground/50">PNG, JPG, WEBP • Max 10 MB</span>
      </div>
      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
