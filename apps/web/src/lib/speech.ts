import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser speech-to-text via the Web Speech API. Transcription happens in the
 * browser (and may use the browser vendor's service), NOT in Passio. The text is
 * shown for editing before it is sent through the normal text flow.
 */

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechToText(onTranscript: (text: string) => void) {
  const [supported] = useState(() => typeof window !== "undefined" && getCtor() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  const start = useCallback(() => {
    const C = getCtor();
    if (!C) return;
    setError(null);
    const rec = new C();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onTranscript(text);
    };
    rec.onerror = (e) =>
      setError(e.error === "not-allowed" ? "Microphone permission was denied." : `Speech recognition error: ${e.error}`);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [onTranscript]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported, listening, error, start, stop };
}
