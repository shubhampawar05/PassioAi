import { useCallback, useState } from "react";
import { api, ApiError, type CreateEntryInput, type RecognitionResponse } from "../lib/api";
import { downscaleImage } from "../lib/image";
import { useSpeechToText } from "../lib/speech";
import { ErrorBox, Spinner } from "./common";
import { BarcodeScanner } from "./BarcodeScanner";
import { ImageUploadForm } from "./ImageUploadForm";
import { ReviewResult } from "./ReviewResult";

type Method = "photo" | "label" | "text" | "barcode" | "voice";

const METHODS: { id: Method; label: string }[] = [
  { id: "photo", label: "Photo" },
  { id: "label", label: "Nutrition label" },
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
  const [scanning, setScanning] = useState(false);
  // Remounts the upload forms after a save so their chosen files are cleared.
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState<null | "recognizing" | "saving">(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [result, setResult] = useState<RecognitionResponse | null>(null);

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

  const submitPhoto = (file: File) => void recognize(async () => api.recognizePhoto(await downscaleImage(file)));
  const submitLabel = (file: File) =>
    void recognize(async () => api.recognizeLabel(await downscaleImage(file, 1600, 0.9)));

  const save = async (entries: CreateEntryInput[]) => {
    setBusy("saving");
    setError(null);
    try {
      for (const e of entries) await api.createEntry(e);
      setResult(null);
      setText("");
      setVoiceText("");
      setBarcode("");
      setFormKey((k) => k + 1);
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
              setScanning(false);
              setError(null);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel">
        {method === "photo" && (
          <ImageUploadForm
            key={`photo-${formKey}`}
            id="photo"
            label="Choose or take a photo of your food (JPEG, PNG, WebP, or GIF, up to 8 MB)"
            submitLabel="Recognize photo"
            disabled={disabled}
            onSubmit={submitPhoto}
            hint="The image is resized in your browser, sent to Passio via our server for recognition, and not stored. Multiple foods in one photo are supported."
          />
        )}

        {method === "label" && (
          <ImageUploadForm
            key={`label-${formKey}`}
            id="label-photo"
            label="Photograph the Nutrition Facts panel of a packaged food"
            submitLabel="Read nutrition label"
            disabled={disabled}
            onSubmit={submitLabel}
            hint="Fill the frame with the whole panel, keep it flat, and avoid glare. Passio reads the label; the image is not stored. Label scans take a few seconds and cost more Passio tokens than a food photo."
          />
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
            <div className="actions">
              <button type="submit" className="btn primary" disabled={disabled || !barcodeValid}>
                Look up barcode
              </button>
              {!scanning && (
                <button type="button" className="btn secondary" disabled={disabled} onClick={() => setScanning(true)}>
                  📷 Scan with camera
                </button>
              )}
            </div>
            {scanning && (
              <BarcodeScanner
                onClose={() => setScanning(false)}
                onDetected={(code) => {
                  setScanning(false);
                  setBarcode(code);
                  void recognize(() => api.recognizeBarcode(code));
                }}
              />
            )}
            <p className="muted small">
              The camera scanner decodes the barcode in your browser (not Passio); the number is then looked up in
              Passio. Tip: the Nutrition label tab reads packaged foods without a barcode.
            </p>
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
          <li>Live camera food recognition (Passio has no web SDK; use the Photo tab).</li>
          <li>Meal plans and the AI nutrition advisor.</li>
        </ul>
      </details>
    </section>
  );
}
