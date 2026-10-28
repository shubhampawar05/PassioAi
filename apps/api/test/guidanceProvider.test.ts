import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MockGuidanceProvider, PassioGuidanceProvider } from "../src/advisor/guidanceProvider.js";
import { AppError } from "../src/errors.js";
import { PassioClient } from "../src/recognition/passioClient.js";
import { createProviders } from "../src/recognition/providerFactory.js";

const BASE = "https://api.passiolife.com/v2";
const json = (status: number, body: unknown) =>
  new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "x-request-id": "req-adv" } });
const tokenOk = () => json(200, { access_token: "tok", expires_in: 86155, customer_id: "cust" });
const live = JSON.parse(readFileSync(new URL("./fixtures/passio-nutritionAdvisor.live.json", import.meta.url), "utf8"));

function setup(responses: Response[]) {
  const fetchImpl = vi.fn(async (..._a: Parameters<typeof fetch>) => responses.shift()!);
  const client = new PassioClient({ apiKey: "k", baseUrl: BASE, timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch, log: () => {} });
  return { provider: new PassioGuidanceProvider(client), fetchImpl };
}

const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as AppError).code;

describe("PassioGuidanceProvider.askAdvisor", () => {
  it("posts {content, message} to nutritionAdvisor and returns the live answer", async () => {
    const { provider, fetchImpl } = setup([tokenOk(), json(200, live)]);
    const r = await provider.askAdvisor("What should I have for dinner tonight?", "CONTEXT");
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe(`${BASE}/products/napi/tools/nutritionAdvisor`);
    expect(JSON.parse(String(init?.body))).toEqual({ content: "What should I have for dinner tonight?", message: "CONTEXT" });
    expect(r).toMatchObject({ source: "passio", requestId: "req-adv" });
    expect(r.answer).toContain("Quinoa and Black Bean");
  });

  it("maps provider errors and malformed bodies", async () => {
    expect(await code(setup([tokenOk(), json(402, {})]).provider.askAdvisor("q", "c"))).toBe("PROVIDER_QUOTA");
    expect(await code(setup([tokenOk(), json(429, {})]).provider.askAdvisor("q", "c"))).toBe("PROVIDER_QUOTA");
    expect(await code(setup([tokenOk(), json(500, {})]).provider.askAdvisor("q", "c"))).toBe("PROVIDER_UNAVAILABLE");
    expect(await code(setup([tokenOk(), json(200, { reply: "x" })]).provider.askAdvisor("q", "c"))).toBe("PROVIDER_BAD_RESPONSE");
    expect(await code(setup([tokenOk(), json(200, { answer: "" })]).provider.askAdvisor("q", "c"))).toBe("PROVIDER_BAD_RESPONSE");
  });
});

describe("createProviders", () => {
  const base = { baseUrl: BASE, timeoutMs: 1000 };
  it("shares mode across recognition and guidance", async () => {
    expect(createProviders({ ...base, mode: "mock", apiKey: undefined }).guidance).toBeInstanceOf(MockGuidanceProvider);
    expect(createProviders({ ...base, mode: "passio", apiKey: "k" }).guidance).toBeInstanceOf(PassioGuidanceProvider);
    const un = createProviders({ ...base, mode: "passio", apiKey: undefined }).guidance;
    expect(un.mode).toBe("unconfigured");
    expect(await code(un.askAdvisor("q", "c"))).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("labels mock answers", async () => {
    const r = await new MockGuidanceProvider().askAdvisor("snack idea");
    expect(r.source).toBe("mock");
    expect(r.answer).toContain("[MOCK]");
  });
});

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("PassioGuidanceProvider meal plans", () => {
  it("posts the preview prompt and parses the live preview", async () => {
    const { provider, fetchImpl } = setup([tokenOk(), json(200, fixture("passio-generateMealPlanPreview.live.json"))]);
    const r = await provider.previewMealPlan("Generate a 2 day meal plan.");
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe(`${BASE}/products/napi/tools/generateMealPlanPreview`);
    expect(JSON.parse(String(init?.body))).toEqual({ content: "Generate a 2 day meal plan." });
    expect(r).toMatchObject({ source: "passio", requestId: "req-adv" });
    expect(r.plan.days).toHaveLength(2);
  });

  it("generates the full plan with a 480 s timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const { provider, fetchImpl } = setup([tokenOk(), json(200, fixture("passio-generateMealPlan.live.json"))]);
    const r = await provider.generateMealPlan('{"mealPlanDays":[]}');
    expect(fetchImpl.mock.calls[1]![0]).toBe(`${BASE}/products/napi/tools/generateMealPlan`);
    expect(timeoutSpy).toHaveBeenCalledWith(480_000);
    expect(r.plan.shoppingList.length).toBe(33);
    timeoutSpy.mockRestore();
  });

  it("humanizes a shopping list", async () => {
    const { provider, fetchImpl } = setup([tokenOk(), json(200, fixture("passio-humanizeShoppingList.live.json"))]);
    const items = await provider.humanizeShoppingList("strawberry, 400, grams");
    expect(fetchImpl.mock.calls[1]![0]).toBe(`${BASE}/products/napi/tools/humanizeShoppingList`);
    expect(items[0]).toEqual({ name: "Fresh Strawberries", shoppingName: "Fresh Strawberries", quantity: 1, unit: "pound", notes: "approx 450g" });
  });

  it("maps errors and malformed meal-plan bodies", async () => {
    expect(await code(setup([tokenOk(), json(402, {})]).provider.generateMealPlan("{}"))).toBe("PROVIDER_QUOTA");
    expect(await code(setup([tokenOk(), json(200, [{ day: 1, meals: [] }])]).provider.previewMealPlan("x"))).toBe("PROVIDER_BAD_RESPONSE");
    expect(await code(setup([tokenOk(), json(200, { list: [] })]).provider.humanizeShoppingList("x"))).toBe("PROVIDER_BAD_RESPONSE");
  });
});

describe("MockGuidanceProvider meal plans", () => {
  it("returns labeled mock previews and regenerates only rejected meals", async () => {
    const mock = new MockGuidanceProvider();
    const first = await mock.previewMealPlan("Generate a 2 day meal plan.");
    expect(first.source).toBe("mock");
    expect(first.plan.days).toHaveLength(2);
    const passio = first.plan.passio as { mealPlanDays: Record<string, { recipes: { rejected: boolean }[] }>[] };
    passio.mealPlanDays[0]!.dinner!.recipes[0]!.rejected = true;
    const regen = await mock.previewMealPlan(JSON.stringify(passio));
    expect(regen.plan.days[0]!.slots.dinner![0]!.name).toContain("(regenerated)");
    expect(regen.plan.days[0]!.slots.lunch![0]!.name).not.toContain("(regenerated)");
    const full = await mock.generateMealPlan(JSON.stringify(first.plan.passio));
    expect(full.plan.days[0]!.slots.breakfast![0]!.macros?.calories).toBe(350);
  });

  it("is unavailable without a key", async () => {
    const un = createProviders({ baseUrl: BASE, timeoutMs: 1000, mode: "passio", apiKey: undefined }).guidance;
    expect(await code(un.previewMealPlan("x"))).toBe("PROVIDER_NOT_CONFIGURED");
    expect(await code(un.generateMealPlan("x"))).toBe("PROVIDER_NOT_CONFIGURED");
    expect(await code(un.humanizeShoppingList("x"))).toBe("PROVIDER_NOT_CONFIGURED");
  });
});
