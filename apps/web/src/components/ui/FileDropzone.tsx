import { useId, useRef, useState, type DragEvent } from 'react';

interface FileDropzoneProps {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  optional?: boolean;
  hint?: string;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Replaces the native "Choose file" control (brief §3.4) — dashed taupe drop zone, drag-and-drop,
 * the chosen filename shown in place, and a clear one-click way to remove it and pick again. */
export function FileDropzone({ label, file, onChange, accept, optional, hint, error }: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onChange(dropped);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-espresso">
        {label}
        {optional && <span className="font-normal text-espresso/80"> (optional)</span>}
      </label>
      {hint && <p className="-mt-1 text-xs text-espresso/80">{hint}</p>}

      {file ? (
        <div className={`flex items-center justify-between gap-3 rounded-card border border-taupe bg-white px-4 py-3 ${error ? 'border-status-significantHigh' : ''}`}>
          <div className="flex min-w-0 items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0 text-bronze">
              <path
                d="M5 2.5h6.5L16 7v10a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-14a.5.5 0 0 1 .5-.5Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path d="M11.5 2.5V7H16" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-espresso">{file.name}</p>
              <p className="text-xs text-espresso/80">{formatSize(file.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${file.name}`}
            className="shrink-0 rounded-full p-1.5 text-espresso/60 transition duration-150 ease-out hover:bg-cream-200 hover:text-status-significantHigh"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center transition duration-150 ease-out ${
            dragOver ? 'border-bronze bg-bronze-50' : error ? 'border-status-significantHigh' : 'border-taupe hover:border-bronze/60'
          }`}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-bronze">
            <path d="M14 18V6M14 6L9 11M14 6l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 18v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-espresso">
            <span className="font-medium text-bronze-700">Choose a file</span> or drag it here
          </p>
          {accept && <p className="text-xs text-espresso/60">{accept.replace('application/pdf', 'PDF')} up to 20MB</p>}
        </div>
      )}

      <input
        ref={inputRef}
        id={fieldId}
        type="file"
        accept={accept}
        required={!optional && !file}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {error && (
        <p role="alert" className="text-sm text-status-significantHigh">
          {error}
        </p>
      )}
    </div>
  );
}
