#!/usr/bin/env node
/**
 * End-to-end smoke test against a running stack (default: docker compose web on :8080).
 *   node scripts/smoke.mjs [baseUrl]
 * Flow: health → recognize (text) → save → list/summary → get → delete → summary,
 * plus input validation and a scan of frontend assets for leaked secrets.
 * In PASSIO_MODE=passio this makes one real Passio text call (consumes tokens).
 * Set SMOKE_SECRET to the API key value to also assert it is absent from web assets.
 */

const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const tz = "UTC";
const today = new Date().toISOString().slice(0, 10);
let failures = 0;

function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}

async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const summary = async () => (await req("GET", `/api/nutrition-summary?date=${today}&tz=${tz}`)).json;

const health = await req("GET", "/api/health");
check("health ok with database", health.status === 200 && health.json?.database === "ok", JSON.stringify(health.json));
const mode = health.json?.recognitionProvider;
console.log(`      provider mode: ${mode}`);

const invalid = await req("POST", "/api/food-recognition", { inputType: "text", text: "" });
check("invalid recognition input → 400 VALIDATION_ERROR", invalid.status === 400 && invalid.json?.error?.code === "VALIDATION_ERROR");

const rec = await req("POST", "/api/food-recognition", { inputType: "text", text: "one medium banana" });
if (mode === "unconfigured") {
  check("unconfigured provider → PROVIDER_NOT_CONFIGURED", rec.json?.error?.code === "PROVIDER_NOT_CONFIGURED");
} else {
  check("text recognition returns candidates", rec.status === 200 && rec.json?.candidates?.length > 0, `status ${rec.status} ${rec.status !== 200 ? JSON.stringify(rec.json) : ""}`);
  check("result source matches provider mode", rec.json?.source === mode);
}

const before = await summary();
const candidate = rec.json?.candidates?.[0];
const serving = candidate?.servings?.[0] ?? {
  label: "1 serving",
  weightG: null,
  nutrients: { calories: 100, proteinG: 1, carbohydratesG: 20, fatG: null },
};
const created = await req("POST", "/api/food-logs", {
  inputType: "text",
  inputSummary: "smoke test",
  foodName: `[SMOKE] ${candidate?.name ?? "test food"}`,
  servingUnit: serving.label,
  servingWeightG: serving.weightG,
  quantity: 2,
  perServing: serving.nutrients,
  provider: rec.json?.source ?? "mock",
  providerRef: candidate?.providerRef ?? null,
  calories: 99999,
});
check("save confirmed entry → 201", created.status === 201, created.status !== 201 ? JSON.stringify(created.json) : "");
const id = created.json?.id;
const expectedCal = serving.nutrients.calories === null ? null : Math.round(serving.nutrients.calories * 2 * 10) / 10;
check("server computed totals (ignores client total)", created.json?.totals?.calories === expectedCal, `calories=${created.json?.totals?.calories}`);

const list = await req("GET", `/api/food-logs?date=${today}&tz=${tz}`);
check("entry appears in day list", list.json?.entries?.some((e) => e.id === id));
const afterSave = await summary();
check("summary entry count increased", afterSave.entryCount === before.entryCount + 1);
if (expectedCal !== null) {
  const delta = Math.round((afterSave.nutrients.calories.total - before.nutrients.calories.total) * 10) / 10;
  check("summary calories increased by entry total", delta === expectedCal, `delta=${delta}`);
}

const got = await req("GET", `/api/food-logs/${id}`);
check("retrieve entry by id", got.status === 200 && got.json?.id === id);

const del = await req("DELETE", `/api/food-logs/${id}`);
check("delete entry → 204", del.status === 204);
const afterDelete = await summary();
check("summary back to previous totals", afterDelete.entryCount === before.entryCount && afterDelete.nutrients.calories.total === before.nutrients.calories.total);
check("deleted entry → 404", (await req("GET", `/api/food-logs/${id}`)).status === 404);

// Frontend asset scan for secrets / direct Passio calls.
const html = await (await fetch(`${base}/`)).text();
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let bundle = html;
for (const a of assets) bundle += await (await fetch(`${base}${a}`)).text();
check("frontend bundle loaded", assets.length > 0, `${assets.length} script(s)`);
check("bundle has no Passio token URL or auth header", !/token-cache|Passio-ID|passiolife\.com/i.test(bundle));
if (process.env.SMOKE_SECRET) {
  check("bundle does not contain the API key", !bundle.includes(process.env.SMOKE_SECRET));
}

console.log(failures === 0 ? "\nSMOKE TEST PASSED" : `\nSMOKE TEST FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
