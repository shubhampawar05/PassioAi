/**
 * Conservative keyword guard that keeps the demo advisor out of clinical territory
 * (medications incl. GLP-1 drugs, dosing, side effects, diagnosis, symptoms,
 * disease treatment, pregnancy). Runs before any Passio call. False positives are
 * acceptable for a demo; the user is asked to rephrase as a general food question.
 */

const BLOCKED_PATTERNS: RegExp[] = [
  /\bmedications?\b/,
  /\bmedicines?\b/,
  /\bdrugs?\b/,
  /\bdos(e|es|age|ing)\b/,
  /\bprescri(be|bed|ption|ptions)\b/,
  /\bside[- ]?effects?\b/,
  /\bsupplements?\s+(for|as|to)\s+(treat|cure|manage)/,
  /\bglp[- ]?1\b/,
  /\b(semaglutide|ozempic|wegovy|rybelsus|tirzepatide|mounjaro|zepbound|liraglutide|saxenda|insulin|metformin)\b/,
  /\bdiagnos(e|es|is|ed|ing)\b/,
  /\bsymptoms?\b/,
  /\bdiseases?\b/,
  // "cure"/"cures" but not "cured meats"; "treat" as a verb, not "a healthy treat".
  /\bcures?\b/,
  /\btreat(ed|ing|ment|ments)\b/,
  /\b(to|help|helps|can|could|will|that|which|does)\s+treat\b/,
  /\bpregnan(t|cy)\b/,
  /\bbreast[- ]?feeding\b/,
];

export const OUT_OF_SCOPE_MESSAGE =
  "This demo advisor can't help with medications, symptoms, diagnoses, treatment, or pregnancy. Please ask a qualified health professional. You can ask a general food question instead, such as a snack or meal idea.";

export function isOutOfScope(text: string): boolean {
  const t = text.toLowerCase();
  return BLOCKED_PATTERNS.some((re) => re.test(t));
}
