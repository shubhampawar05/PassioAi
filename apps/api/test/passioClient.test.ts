import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors.js";
import { MockProvider } from "../src/recognition/mockProvider.js";
import { PassioProvider } from "../src/recognition/passioProvider.js";
import { createProvider } from "../src/recognition/providerFactory.js";

const BASE = "https://api.passiolife.com/v2";
const KEY = "test-key-not-real";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const tokenOk = () => json(200, { access_token: "tok-1", expires_in: 86155, customer_id: "cust-1", token_type: "Bearer" });

function setup(responses: Array<Response | Error>, extra: { now?: () => number } = {}) {
  const fetchImpl = vi.fn(async (..._args: Parameters<typeof fetch>) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  });
  const logs: string[] = [];
  const provider = new PassioProvider({
    apiKey: KEY,
    baseUrl: BASE,
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    log: (l) => logs.push(l),
    ...extra,
  });
  return { provider, fetchImpl, logs };
}

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
}

describe("PassioProvider / PassioClient", () => {
  it("exchanges the key for a token and sends documented headers", async () => {
    const { provider, fetchImpl, logs } = setup([
      tokenOk(),
      json(200, [{ displayName: "Toast", nutritionPreview: { calories: 80 } }], { "x-request-id": "req-123" }),
    ]);
    const result = await provider.recognizeText("toast");
    expect(result).toMatchObject({ source: "passio", requestId: "req-123", candidates: [{ name: "Toast" }] });

    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0]!;
    expect(tokenUrl).toBe(`${BASE}/token-cache/unified/oauth/token/${KEY}`);
    expect(tokenInit?.method).toBe("POST");

    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe(`${BASE}/products/napi/tools/extractMealLogAction`);
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok-1", "Passio-ID": "cust-1" });
    expect(JSON.parse(String(init?.body))).toEqual({ content: "toast" });

    // Logs never contain the key, token, or content.
    const all = logs.join("\n");
    expect(all).not.toContain(KEY);
    expect(all).not.toContain("tok-1");
    expect(all).not.toContain("toast\"");
  });

  it("sends photos as a base64 data URI to the vision route", async () => {
    const { provider, fetchImpl } = setup([tokenOk(), json(200, [])]);
    const result = await provider.recognizeImage(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg");
    expect(result.candidates).toEqual([]);
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe(`${BASE}/products/napi/tools/vision/extractIngredientsAutoTyped`);
    expect(JSON.parse(String(init?.body)).image).toBe("data:image/jpeg;base64,/9j/AA==");
  });

  it("caches the token across calls until near expiry", async () => {
    let now = 1_000_000;
    const { provider, fetchImpl } = setup([tokenOk(), json(200, []), json(200, []), tokenOk(), json(200, [])], {
      now: () => now,
    });
    await provider.recognizeText("a");
    await provider.recognizeText("b");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    now += 86_155_000; // past expiry
    await provider.recognizeText("c");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("re-authenticates once on 401 and retries", async () => {
    const { provider, fetchImpl } = setup([tokenOk(), json(401, {}), tokenOk(), json(200, [])]);
    await expect(provider.recognizeText("x")).resolves.toMatchObject({ candidates: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("maps persistent 401/403 to PROVIDER_AUTH", async () => {
    await expectCode(setup([tokenOk(), json(401, {}), tokenOk(), json(401, {})]).provider.recognizeText("x"), "PROVIDER_AUTH");
    await expectCode(setup([tokenOk(), json(403, { code: 403, cause: "forbidden" })]).provider.recognizeText("x"), "PROVIDER_AUTH");
  });

  it("maps an invalid key on the token route to PROVIDER_AUTH", async () => {
    await expectCode(setup([json(403, "invalid key")]).provider.recognizeText("x"), "PROVIDER_AUTH");
  });

  it("maps 402 and 429 to PROVIDER_QUOTA", async () => {
    await expectCode(setup([tokenOk(), json(402, {})]).provider.recognizeText("x"), "PROVIDER_QUOTA");
    await expectCode(setup([tokenOk(), json(429, {})]).provider.recognizeText("x"), "PROVIDER_QUOTA");
  });

  it("maps 5xx and network errors to PROVIDER_UNAVAILABLE", async () => {
    await expectCode(setup([tokenOk(), json(503, {})]).provider.recognizeText("x"), "PROVIDER_UNAVAILABLE");
    await expectCode(setup([new TypeError("fetch failed")]).provider.recognizeText("x"), "PROVIDER_UNAVAILABLE");
  });

  it("maps 400 to PROVIDER_REJECTED_INPUT with the documented cause", async () => {
    const err = await setup([tokenOk(), json(400, { code: 400, cause: "bad image" })])
      .provider.recognizeImage(Buffer.from([1]), "image/png")
      .catch((e: AppError) => e);
    expect(err).toMatchObject({ code: "PROVIDER_REJECTED_INPUT" });
    expect((err as AppError).message).toContain("bad image");
  });

  it("maps timeouts to PROVIDER_TIMEOUT", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    await expectCode(setup([tokenOk(), timeout as unknown as Error]).provider.recognizeText("x"), "PROVIDER_TIMEOUT");
  });

  it("maps malformed bodies to PROVIDER_BAD_RESPONSE", async () => {
    await expectCode(setup([tokenOk(), json(200, { not: "an array" })]).provider.recognizeText("x"), "PROVIDER_BAD_RESPONSE");
    await expectCode(setup([tokenOk(), json(200, "<html>oops</html>")]).provider.recognizeText("x"), "PROVIDER_BAD_RESPONSE");
    await expectCode(setup([json(200, { access_token: "t" })]).provider.recognizeText("x"), "PROVIDER_BAD_RESPONSE");
    await expectCode(setup([tokenOk(), json(200, { nutrients: [] })]).provider.lookupBarcode("123456"), "PROVIDER_BAD_RESPONSE");
  });

  it("returns zero candidates when a barcode is not found (404)", async () => {
    const { provider, fetchImpl } = setup([tokenOk(), json(404, { code: 404, cause: "not found" })]);
    await expect(provider.lookupBarcode("012345678905")).resolves.toMatchObject({ candidates: [] });
    expect(fetchImpl.mock.calls[1]![0]).toBe(`${BASE}/products/napi/food/productCode/012345678905`);
  });
});

describe("createProvider", () => {
  const base = { baseUrl: BASE, timeoutMs: 1000 };

  it("uses the mock only when explicitly requested", () => {
    expect(createProvider({ ...base, mode: "mock", apiKey: undefined })).toBeInstanceOf(MockProvider);
    expect(createProvider({ ...base, mode: "passio", apiKey: KEY })).toBeInstanceOf(PassioProvider);
  });

  it("fails with PROVIDER_NOT_CONFIGURED (never mock data) when the key is missing", async () => {
    const p = createProvider({ ...base, mode: "passio", apiKey: undefined });
    expect(p.mode).toBe("unconfigured");
    await expectCode(p.recognizeText("x"), "PROVIDER_NOT_CONFIGURED");
    await expectCode(p.lookupBarcode("123456"), "PROVIDER_NOT_CONFIGURED");
  });

  it("labels every mock result as mock", async () => {
    const r = await new MockProvider().recognizeText("eggs");
    expect(r.source).toBe("mock");
    expect(r.candidates.every((c) => c.name.startsWith("[MOCK]"))).toBe(true);
  });
});
