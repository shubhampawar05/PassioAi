import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarcodeScanner } from "../src/components/BarcodeScanner";
import { pickBarcode } from "../src/lib/barcode";

function fakeStream() {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn() }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
});

afterEach(() => vi.restoreAllMocks());

describe("BarcodeScanner", () => {
  it("submits the first valid code and stops the camera", async () => {
    const { stream, track } = fakeStream();
    const detect = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rawValue: "abc" }, { rawValue: "049000028911" }]);
    const onDetected = vi.fn();
    render(
      <BarcodeScanner
        onDetected={onDetected}
        onClose={() => {}}
        getStream={async () => stream}
        createDetector={async () => ({ detect })}
      />,
    );
    await waitFor(() => expect(onDetected).toHaveBeenCalledWith("049000028911"), { timeout: 2000 });
    expect(track.stop).toHaveBeenCalled();
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it("stops the camera when unmounted (e.g. leaving the tab)", async () => {
    const { stream, track } = fakeStream();
    const { unmount } = render(
      <BarcodeScanner onDetected={() => {}} onClose={() => {}} getStream={async () => stream} createDetector={async () => ({ detect: async () => [] })} />,
    );
    await screen.findByText(/Hold the barcode steady/);
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("releases the camera if the detector fails to load", async () => {
    const { stream, track } = fakeStream();
    render(
      <BarcodeScanner
        onDetected={() => {}}
        onClose={() => {}}
        getStream={async () => stream}
        createDetector={async () => {
          throw new Error("wasm failed");
        }}
      />,
    );
    expect(await screen.findByText(/Could not start the barcode scanner/)).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
  });

  it("explains a denied permission and offers Close", async () => {
    const onClose = vi.fn();
    render(
      <BarcodeScanner
        onDetected={() => {}}
        onClose={onClose}
        getStream={async () => {
          throw new DOMException("denied", "NotAllowedError");
        }}
        createDetector={async () => ({ detect: async () => [] })}
      />,
    );
    expect(await screen.findByText(/Camera permission was denied/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses to start outside a secure context", () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    const getStream = vi.fn();
    render(<BarcodeScanner onDetected={() => {}} onClose={() => {}} getStream={getStream} createDetector={async () => ({ detect: async () => [] })} />);
    expect(screen.getByText(/needs a secure page/)).toBeInTheDocument();
    expect(getStream).not.toHaveBeenCalled();
  });
});

describe("pickBarcode", () => {
  it("accepts 6–14 digit codes only", () => {
    expect(pickBarcode([{ rawValue: "12345" }, { rawValue: " 0123456789012 " }])).toBe("0123456789012");
    expect(pickBarcode([{ rawValue: "https://example.com" }])).toBeNull();
  });
});
