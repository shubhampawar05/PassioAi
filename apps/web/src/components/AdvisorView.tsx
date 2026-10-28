import { useCallback, useState } from "react";
import { api, ApiError, type AdvisorTurn, type ProviderSource } from "../lib/api";
import { useSpeechToText } from "../lib/speech";
import { AdvisorAnswer, GeneralGuidanceNotice } from "./AdvisorAnswer";
import { ErrorBox, Spinner } from "./common";

type Turn = AdvisorTurn & { source: ProviderSource };

const MAX_HISTORY = 3;

/**
 * Conversation lives only in this component's state: it is not stored on the
 * server and is lost on reload. The last 3 turns are sent as context.
 */
export function AdvisorView({ onEditProfile }: { onEditProfile: () => void }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; outOfScope: boolean; retry?: () => void } | null>(null);

  const onTranscript = useCallback((t: string) => setQuestion((prev) => (prev ? `${prev} ${t}` : t)), []);
  const speech = useSpeechToText(onTranscript);

  const ask = async (q: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const history = turns.slice(-MAX_HISTORY).map(({ question, answer }) => ({ question, answer }));
      const res = await api.askAdvisor(q, history);
      setTurns((prev) => [...prev, { question: q, answer: res.answer, source: res.source }]);
      setQuestion("");
    } catch (e) {
      const outOfScope = e instanceof ApiError && e.code === "ADVISOR_OUT_OF_SCOPE";
      setError({
        message: e instanceof ApiError ? e.message : "The advisor request failed",
        outOfScope,
        retry: outOfScope ? undefined : () => void ask(q),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="advisor-heading">
      <h2 id="advisor-heading">Nutrition advisor</h2>
      <p className="muted small">
        Ask a general food question. Answers come from Passio AI and use your{" "}
        <button type="button" className="btn link small inline-link" onClick={onEditProfile}>
          profile
        </button>{" "}
        and today&apos;s log as context. Questions about medications, symptoms, diagnoses, treatment, or pregnancy
        are not answered. This conversation is not saved.
      </p>
      <GeneralGuidanceNotice />

      {turns.length > 0 && (
        <ol className="thread" aria-label="Conversation">
          {turns.map((t, i) => (
            <li key={i} className="turn">
              <p className="turn-q">
                <strong>You:</strong> {t.question}
              </p>
              <AdvisorAnswer answer={t.answer} source={t.source} />
            </li>
          ))}
        </ol>
      )}

      {busy && <Spinner label="Asking Passio's advisor…" />}
      {error &&
        (error.outOfScope ? (
          <p className="notice" role="alert">
            {error.message}
          </p>
        ) : (
          <ErrorBox message={error.message} onRetry={error.retry} />
        ))}

      <form
        className="advisor-form"
        onSubmit={(e) => {
          e.preventDefault();
          const q = question.trim();
          if (q) void ask(q);
        }}
      >
        <label htmlFor="advisor-question">Your question</label>
        <textarea
          id="advisor-question"
          rows={2}
          maxLength={500}
          placeholder="e.g. Give me a high-protein vegetarian snack idea"
          value={question}
          disabled={busy}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="actions">
          <button type="submit" className="btn primary" disabled={busy || !question.trim()}>
            {busy ? "Asking…" : "Ask"}
          </button>
          {speech.supported && (
            <button
              type="button"
              className={`btn ${speech.listening ? "danger" : "secondary"}`}
              onClick={speech.listening ? speech.stop : speech.start}
              disabled={busy}
            >
              {speech.listening ? "■ Stop" : "🎤 Speak"}
            </button>
          )}
          {turns.length > 0 && (
            <button type="button" className="btn link" onClick={() => setTurns([])} disabled={busy}>
              Clear conversation
            </button>
          )}
        </div>
        {speech.error && <p className="field-error">{speech.error}</p>}
      </form>
    </section>
  );
}
