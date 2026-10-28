import { useEffect, useRef, useState } from "react";
import { cameraUnavailableReason, createRetailDetector, describeCameraError, pickBarcode, type Detector } from "../lib/barcode";

const SCAN_INTERVAL_MS = 250;

type Props = {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  /** Injectable for tests. */
  createDetector?: () => Promise<Detector>;
  getStream?: () => Promise<MediaStream>;
};

const defaultStream = () =>
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });

/**
 * Live camera barcode scanner. Decodes on-device and stops the camera as soon as
 * a code is found, on cancel, or when unmounted (e.g. leaving the Barcode tab).
 */
export function BarcodeScanner({ onDetected, onClose, createDetector = createRetailDetector, getStream = defaultStream }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(() => cameraUnavailableReason());
  const [status, setStatus] = useState<"starting" | "scanning" | "error">(() => (error ? "error" : "starting"));
  // Latest callback without restarting the camera when the parent re-renders.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (cameraUnavailableReason()) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    (async () => {
      try {
        // Open the camera first so a detector-load failure can still release it.
        const s = await getStream();
        stream = s;
        if (stopped) return stop();
        const detector = await createDetector();
        if (stopped) return stop();
        const video = videoRef.current;
        if (!video) return stop();
        video.srcObject = s;
        await video.play().catch(() => undefined);
        setStatus("scanning");

        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const code = pickBarcode(await detector.detect(video));
              if (code) {
                stop();
                onDetectedRef.current(code);
                return;
              }
            }
          } catch {
            // A single frame failing to decode is normal; keep scanning.
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (err) {
        const cancelled = stopped;
        stop();
        if (!cancelled) {
          setError(describeCameraError(err));
          setStatus("error");
        }
      }
    })();

    return stop;
  }, [createDetector, getStream]);

  return (
    <div className="scanner" aria-live="polite">
      {status !== "error" && (
        <>
          <video ref={videoRef} className="scanner-video" muted playsInline aria-label="Camera preview for barcode scanning" />
          <p className="muted small">
            {status === "starting" ? "Starting camera…" : "Hold the barcode steady inside the frame."} Scanning
            happens on your device; only the number is sent.
          </p>
        </>
      )}
      {status === "error" && error && <p className="notice">{error}</p>}
      <button type="button" className="btn secondary" onClick={onClose}>
        {status === "error" ? "Close" : "Cancel scanning"}
      </button>
    </div>
  );
}
