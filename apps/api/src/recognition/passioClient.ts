import { AppError } from "../errors.js";
import { passioErrorSchema, tokenResponseSchema } from "./passioSchemas.js";

/**
 * Minimal Passio REST client. Auth flow per
 * https://passio.gitbook.io/nutrition-ai/rest-api/api-overview/authorization-setup :
 *   POST {base}/token-cache/unified/oauth/token/{API_KEY} → { access_token, expires_in, customer_id }
 *   then every call sends `Authorization: Bearer <token>` and `Passio-ID: <customer_id>`.
 * Never logs the key, token, or request bodies.
 */

export type PassioClientOptions = {
  apiKey: string;
  /** e.g. https://api.passiolife.com/v2 */
  baseUrl: string;
  timeoutMs: number;
  tokenTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  now?: () => number;
};

export type PassioResponse = { status: number; body: unknown; requestId: string | null };

type CachedToken = { accessToken: string; customerId: string; expiresAt: number };

const TOKEN_REFRESH_MARGIN_MS = 60_000;

export class PassioClient {
  private token: CachedToken | null = null;
  private tokenInFlight: Promise<CachedToken> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (line: string) => void;
  private readonly now: () => number;

  constructor(private readonly opts: PassioClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.log = opts.log ?? ((line) => console.info(line));
    this.now = opts.now ?? Date.now;
  }

  /** Sends a request to a `/products/napi/...` route. 404 is returned to the caller; other errors throw AppError. */
  async request(
    method: "GET" | "POST",
    path: string,
    options: { json?: unknown; timeoutMs?: number; logLabel: string },
  ): Promise<PassioResponse> {
    let res = await this.send(method, path, options, await this.getToken());
    if (res.status === 401) {
      // Token may have expired or been revoked: re-authenticate once and retry once.
      this.token = null;
      res = await this.send(method, path, options, await this.getToken());
    }
    if (res.status >= 200 && res.status < 300) return res;
    if (res.status === 404) return res;
    throw mapProviderStatus(res.status, res.body);
  }

  private async send(
    method: "GET" | "POST",
    path: string,
    options: { json?: unknown; timeoutMs?: number; logLabel: string },
    token: CachedToken,
  ): Promise<PassioResponse> {
    const started = this.now();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token.accessToken}`,
      "Passio-ID": token.customerId,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.json);
    }
    const res = await this.fetchWithTimeout(
      `${this.opts.baseUrl}${path}`,
      { method, headers, body },
      options.timeoutMs ?? this.opts.timeoutMs,
    );
    const parsedBody = await readJson(res);
    const requestId = res.headers.get("x-request-id");
    this.log(
      `[passio] ${options.logLabel} status=${res.status} durationMs=${this.now() - started}` +
        (requestId ? ` requestId=${requestId}` : "") +
        (body ? ` requestBytes=${body.length}` : ""),
    );
    return { status: res.status, body: parsedBody, requestId };
  }

  private async getToken(): Promise<CachedToken> {
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) return this.token;
    if (!this.tokenInFlight) {
      this.tokenInFlight = this.fetchToken().finally(() => {
        this.tokenInFlight = null;
      });
    }
    this.token = await this.tokenInFlight;
    return this.token;
  }

  private async fetchToken(): Promise<CachedToken> {
    const url = `${this.opts.baseUrl}/token-cache/unified/oauth/token/${encodeURIComponent(this.opts.apiKey)}`;
    const started = this.now();
    const res = await this.fetchWithTimeout(url, { method: "POST" }, this.opts.tokenTimeoutMs ?? 10_000);
    const body = await readJson(res);
    this.log(`[passio] token status=${res.status} durationMs=${this.now() - started}`);
    if (res.status < 200 || res.status >= 300) {
      // Any 4xx on the token route means the key itself was not accepted.
      if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 402) {
        throw new AppError("PROVIDER_AUTH", "Passio rejected the API key. Check PASSIO_API_KEY.");
      }
      throw mapProviderStatus(res.status, body);
    }
    const parsed = tokenResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("PROVIDER_BAD_RESPONSE", "Passio token response was not in the documented format");
    }
    return {
      accessToken: parsed.data.access_token,
      customerId: parsed.data.customer_id,
      expiresAt: this.now() + parsed.data.expires_in * 1000,
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AppError("PROVIDER_TIMEOUT", `Passio did not respond within ${Math.round(timeoutMs / 1000)} s`);
      }
      throw new AppError("PROVIDER_UNAVAILABLE", "Could not reach Passio (network error)");
    }
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Maps documented Passio HTTP errors (errors-and-troubleshooting page) to app error codes. */
export function mapProviderStatus(status: number, body: unknown): AppError {
  const parsed = passioErrorSchema.safeParse(body);
  const cause = parsed.success && parsed.data.cause ? parsed.data.cause.slice(0, 200) : undefined;
  if (status === 401 || status === 403) {
    return new AppError("PROVIDER_AUTH", "Passio rejected the credentials or this account lacks permission");
  }
  if (status === 402 || status === 429) {
    return new AppError("PROVIDER_QUOTA", "Passio token budget exhausted or capacity limit reached. Try again later.");
  }
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return new AppError(
      "PROVIDER_REJECTED_INPUT",
      cause ? `Passio could not process this input: ${cause}` : "Passio could not process this input",
    );
  }
  return new AppError("PROVIDER_UNAVAILABLE", `Passio returned an error (HTTP ${status}). Try again.`);
}
