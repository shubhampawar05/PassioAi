import { useCallback, useRef, useState } from "react";
import { api, ApiError, type CreateEntryInput, type RecognitionResponse } from "../lib/api";
import { ACCEPTED_IMAGE_TYPES, downscaleImage, MAX_UPLOAD_BYTES } from "../lib/image";
import { useSpeechToText } from "../lib/speech";
import { ErrorBox, Spinner } from "./common";
import { ReviewResult } from "./ReviewResult";

type Method = "photo" | "text" | "barcode" | "voice";

const METHODS: { id: Method; label: string }[] = [
  { id: "photo", label: "Photo" },
  { id: "text", label: "Describe it" },
  { id: "barcode", label: "Barcode" },
  { id: "voice", label: "Voice" },
];

const ERROR_HINTS: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED: "The server has no Passio API key configured.",
  PROVIDER_AUTH: "The Passio API key was rejected. Check the server configuration.",
  PROVIDER_QUOTA: "The Passio usage budget or capacity limit was reached. Try again later.",
  PROVIDER_TIMEOUT: "Passio took too long to respond.",
};

export function LogFood({ onSaved }: { onSaved: () => void }) {
  const [method, setMethod] = useState<Method>("photo");
  const [text, setText] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [barcode, setBarcode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "recognizing" | "saving">(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [result, setResult] = useState<RecognitionResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onTranscript = useCallback((t: string) => setVoiceText((prev) => (prev ? `${prev} ${t}` : t)), []);
  const speech = useSpeechToText(onTranscript);

  const recognize = async (fn: () => Promise<RecognitionResponse>) => {
    if (busy) return;
    setBusy("recognizing");
    setError(null);
    try {
      setResult(await fn());
    } catch (e) {
      const msg = e instanceof ApiError ? (ERROR_HINTS[e.code] ? `${ERROR_HINTS[e.code]} (${e.message})` : e.message) : "Recognition failed";
      setError({ message: msg, retry: () => void recognize(fn) });
    } finally {
      setBusy(null);
    }
  };

  const submitPhoto = () => {
    if (!file) return;
    void recognize(async () => api.recognizePhoto(await downscaleImage(file)));
  };

  const save = async (entries: CreateEntryInput[]) => {
    setBusy("saving");
    setError(null);
    try {
      for (const e of entries) await api.createEntry(e);
      setResult(null);
      setText("");
      setVoiceText("");
      setBarcode("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      onSaved();
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : "Saving failed" });
    } finally {
      setBusy(null);
    }
  };

  if (result) {
    return (
      <>
        {error && <ErrorBox message={error.message} onRetry={error.retry} />}
        {busy === "recognizing" && <Spinner label="Asking Passio…" />}
        <ReviewResult
          key={`${result.requestId}-${result.inputSummary}`}
          result={result}
          saving={busy !== null}
          onSave={(entries) => void save(entries)}
          onRetryText={(t) => void recognize(() => api.recognizeText("text", t))}
          onCancel={() => setResult(null)}
        />
      </>
    );
  }

  const disabled = busy !== null;
  const barcodeValid = /^\d{6,14}$/.test(barcode.trim());

  return (
    <section className="card" aria-labelledby="log-heading">
      <h2 id="log-heading">Log food</h2>
      <div className="tabs" role="tablist" aria-label="Input method">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={method === m.id}
            className={`tab ${method === m.id ? "active" : ""}`}
            onClick={() => {
              setMethod(m.id);
              setError(null);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel">
        {method === "photo" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitPhoto();
            }}
          >
            <label htmlFor="photo">Choose or take a photo of your food (JPEG, PNG, WebP, or GIF, up to 8 MB)</label>
            <input
              ref={fileInput}
              id="photo"
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
            <p className="muted small">
              The image is resized in your browser, sent to Passio via our server for recognition, and not stored.
              Multiple foods in one photo are supported.
            </p>
            <button type="submit" className="btn primary" disabled={disabled || !file}>
              Recognize photo
            </button>
          </form>
        )}

        {method === "text" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void recognize(() => api.recognizeText("text", text.trim()));
            }}
          >
            <label htmlFor="text-input">Describe what you ate</label>
            <textarea
              id="text-input"
              rows={3}
              maxLength={500}
              placeholder="e.g. two scrambled eggs and a slice of whole wheat toast"
              value={text}
              disabled={disabled}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="btn primary" disabled={disabled || !text.trim()}>
              Recognize text
            </button>
          </form>
        )}

        {method === "barcode" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (barcodeValid) void recognize(() => api.recognizeBarcode(barcode.trim()));
            }}
          >
            <label htmlFor="barcode-input">Enter the barcode number (UPC/EAN, 6–14 digits)</label>
            <input
              id="barcode-input"
              inputMode="numeric"
              autoComplete="off"
              value={barcode}
              disabled={disabled}
              aria-invalid={barcode !== "" && !barcodeValid}
              onChange={(e) => setBarcode(e.target.value.replace(/[^\d]/g, ""))}
            />
            <p className="muted small">
              Live camera barcode scanning is not included in this POC (Passio has no web SDK). Tip: a photo of a
              barcode or package also works in the Photo tab.
            </p>
            <button type="submit" className="btn primary" disabled={disabled || !barcodeValid}>
              Look up barcode
            </button>
          </form>
        )}

        {method === "voice" &&
          (speech.supported ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (voiceText.trim()) void recognize(() => api.recognizeText("voice", voiceText.trim()));
              }}
            >
              <p className="muted small">
                Speech is transcribed by your browser&apos;s speech recognition, not by Passio. Review and edit the
                text, then submit it.
              </p>
              <button
                type="button"
                className={`btn ${speech.listening ? "danger" : "secondary"}`}
                onClick={speech.listening ? speech.stop : speech.start}
                disabled={disabled}
              >
                {speech.listening ? "■ Stop listening" : "🎤 Start speaking"}
              </button>
              {speech.error && <p className="field-error">{speech.error}</p>}
              <label htmlFor="voice-text">Transcribed text (editable)</label>
              <textarea
                id="voice-text"
                rows={3}
                maxLength={500}
                value={voiceText}
                disabled={disabled}
                onChange={(e) => setVoiceText(e.target.value)}
              />
              <button type="submit" className="btn primary" disabled={disabled || !voiceText.trim()}>
                Recognize transcript
              </button>
            </form>
          ) : (
            <p className="notice" role="status">
              Voice input is unavailable: this browser does not support the Web Speech API. Try Chrome, Edge, or
              Safari, or use the “Describe it” tab.
            </p>
          ))}
      </div>

      {busy === "recognizing" && <Spinner label="Asking Passio… this can take several seconds." />}
      {error && <ErrorBox message={error.message} onRetry={error.retry} />}

      <details className="not-included">
        <summary>Not included in this POC</summary>
        <ul>
          <li>Dedicated nutrition-facts label scanning (documented by Passio, not implemented here).</li>
          <li>Live camera recognition and live barcode scanning (no Passio web SDK).</li>
          <li>Meal plans and the AI nutrition advisor.</li>
        </ul>
      </details>
    </section>
  );
}
