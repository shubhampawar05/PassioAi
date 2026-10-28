import { useState, type ReactNode } from "react";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "../lib/image";

type Props = {
  id: string;
  label: string;
  submitLabel: string;
  disabled: boolean;
  hint: ReactNode;
  onSubmit: (file: File) => void;
};

/** File picker with client-side type/size checks; `capture` opens the rear camera on phones. */
export function ImageUploadForm({ id, label, submitLabel, disabled, hint, onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (file) onSubmit(file);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        capture="environment"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFileError(null);
          if (f && !ACCEPTED_IMAGE_TYPES.includes(f.type)) {
            setFileError("Unsupported file type. Use a JPEG, PNG, WebP, or GIF image.");
            setFile(null);
          } else if (f && f.size > MAX_UPLOAD_BYTES) {
            setFileError("Image must be 8 MB or smaller.");
            setFile(null);
          } else setFile(f);
        }}
      />
      {fileError && <p className="field-error">{fileError}</p>}
      <p className="muted small">{hint}</p>
      <button type="submit" className="btn primary" disabled={disabled || !file}>
        {submitLabel}
      </button>
    </form>
  );
}
