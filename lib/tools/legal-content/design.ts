import type { FormatLayout } from "./formats";

/**
 * The content design system. Every published card is built from these tokens
 * only: canvas size, type scale, spacing, and the fixed regions (brand bar,
 * title, body, source field, footer). Sizes are percentages of the card width
 * (CSS container units, `cqw`), so a card looks identical in the editor preview,
 * on screen and in print, at any scale.
 */
export interface CanvasTokens {
  /** Export size in CSS pixels (also the print page size). */
  width: number;
  /** Fixed height; null for documents, which flow onto as many A4 pages as needed. */
  height: number | null;
  sizeLabel: string;
  padding: number;
  type: { display: number; heading: number; body: number; quote: number; kicker: number; meta: number };
  space: { section: number; block: number };
  /** Line heights are part of the system, not left to defaults. */
  leading: { display: number; heading: number; body: number };
}

export const CANVAS: Record<FormatLayout, CanvasTokens> = {
  slides: {
    width: 1080,
    height: 1350,
    sizeLabel: "1080 × 1350 (4:5)",
    padding: 7,
    type: { display: 7.4, heading: 5.2, body: 3.6, quote: 3.7, kicker: 2.3, meta: 1.9 },
    space: { section: 4, block: 2.6 },
    leading: { display: 1.35, heading: 1.4, body: 1.75 },
  },
  card: {
    width: 1080,
    height: 1080,
    sizeLabel: "1080 × 1080 (1:1)",
    padding: 6,
    type: { display: 5.6, heading: 3.6, body: 2.75, quote: 2.85, kicker: 1.9, meta: 1.6 },
    space: { section: 2.6, block: 1.6 },
    leading: { display: 1.35, heading: 1.4, body: 1.7 },
  },
  document: {
    width: 794,
    height: null,
    sizeLabel: "A4 (794 × 1123)",
    padding: 8,
    type: { display: 4.4, heading: 2.9, body: 2.05, quote: 2.1, kicker: 1.6, meta: 1.45 },
    space: { section: 3.4, block: 1.8 },
    leading: { display: 1.4, heading: 1.45, body: 1.85 },
  },
};

/** A4 page height at 96 dpi, for document print pages. */
export const A4_HEIGHT = 1123;

/** The fixed footer line on every card. */
export const CONTENT_DISCLAIMER = "محتوى توعوي عام، لا يُعد استشارة قانونية لحالة بعينها.";
export const DRAFT_MARK = "مسودة — لم تُعتمد للنشر";
export const BRAND_PLACEHOLDER = "اسم المكتب";

/** Two-letter monogram for the brand mark, from the firm name. */
export function brandMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "م";
  return words
    .slice(0, 2)
    .map((w) => w.replace(/^ال/, "").charAt(0))
    .join("");
}

/** CSS custom properties for a canvas, applied on the card root. */
export function canvasStyle(tokens: CanvasTokens): Record<string, string> {
  return {
    "--cs-pad": `${tokens.padding}cqw`,
    "--cs-display": `${tokens.type.display}cqw`,
    "--cs-heading": `${tokens.type.heading}cqw`,
    "--cs-body": `${tokens.type.body}cqw`,
    "--cs-quote": `${tokens.type.quote}cqw`,
    "--cs-kicker": `${tokens.type.kicker}cqw`,
    "--cs-meta": `${tokens.type.meta}cqw`,
    "--cs-section": `${tokens.space.section}cqw`,
    "--cs-block": `${tokens.space.block}cqw`,
    "--cs-lead-display": String(tokens.leading.display),
    "--cs-lead-heading": String(tokens.leading.heading),
    "--cs-lead-body": String(tokens.leading.body),
  };
}
