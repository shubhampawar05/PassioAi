import ReactMarkdown from "react-markdown";
import type { ProviderSource } from "../lib/api";
import { MockBadge } from "./common";

/** Shown with every advisor answer and (later) every meal plan. */
export function GeneralGuidanceNotice({ extra }: { extra?: string }) {
  return (
    <p className="guidance-notice" role="note">
      General information from Passio AI, not medical advice. It may be inaccurate and does not account for medical
      needs.{extra ? ` ${extra}` : ""}
    </p>
  );
}

/**
 * Renders Passio's markdown answer. Raw HTML is never rendered: `<` is turned into
 * an entity first so any tags show up as inert text, and react-markdown runs
 * without rehype-raw. Markdown images are not loaded (shown as their alt text).
 */
export function escapeHtml(markdown: string): string {
  return markdown.replace(/</g, "&lt;");
}

export function AdvisorAnswer({ answer, source }: { answer: string; source: ProviderSource }) {
  return (
    <div className="advisor-answer">
      {source === "mock" && <MockBadge />}
      <div className="markdown">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            img: ({ alt }) => <span>[image: {alt}]</span>,
          }}
        >
          {escapeHtml(answer)}
        </ReactMarkdown>
      </div>
      <GeneralGuidanceNotice extra="Check ingredients for allergies." />
    </div>
  );
}
