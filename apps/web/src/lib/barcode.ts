/**
 * On-device barcode decoding. Uses the browser's native BarcodeDetector when it
 * supports retail formats (Chrome/Edge/Android), otherwise the `barcode-detector`
 * ponyfill backed by zxing-wasm. The .wasm file is bundled with the app (no CDN
 * request), and the ponyfill is only loaded when the scanner opens.
 * Camera frames never leave the device; only the decoded digits are sent to our API.
 */

export const RETAIL_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

export type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

type NativeCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

export async function createRetailDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
  if (Native) {
    try {
      // macOS Chromium lists ean_13 but not upc_a; UPC-A codes still decode as EAN-13
      // (with a leading 0), so native is usable whenever EAN-13 is supported.
      const supported = await Native.getSupportedFormats();
      const formats = RETAIL_FORMATS.filter((f) => supported.includes(f));
      if (formats.includes("ean_13")) return new Native({ formats });
    } catch {
      // fall through to the ponyfill
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
  });
  return new BarcodeDetector({ formats: [...RETAIL_FORMATS] });
}

/** Returns the first plausible retail barcode (6–14 digits), or null. */
export function pickBarcode(results: { rawValue: string }[]): string | null {
  for (const r of results) {
    const digits = r.rawValue.trim();
    if (/^\d{6,14}$/.test(digits)) return digits;
  }
  return null;
}

/** Human-readable reason the camera scanner can't start, or null if it can try. */
export function cameraUnavailableReason(): string | null {
  if (!window.isSecureContext) {
    return "Camera scanning needs a secure page (https:// or localhost). Enter the barcode number instead.";
  }
  if (!navigator.mediaDevices?.getUserMedia) return "This browser does not support camera access. Enter the barcode number instead.";
  return null;
}

export function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access in your browser settings, or enter the barcode number.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found. Enter the barcode number instead.";
  if (name === "NotReadableError") return "The camera is in use by another app. Close it and try again, or enter the number.";
  return "Could not start the barcode scanner. Enter the barcode number instead.";
}
