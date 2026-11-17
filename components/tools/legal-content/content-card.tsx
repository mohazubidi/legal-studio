import type { CSSProperties, ReactNode } from "react";
import { BRAND_PLACEHOLDER, brandMonogram, canvasStyle, CONTENT_DISCLAIMER, DRAFT_MARK, type CanvasTokens } from "@/lib/tools/legal-content/design";
import type { ContentView, ViewBlock, ViewCard } from "@/lib/tools/legal-content/view";
import { cn } from "@/lib/utils";

/**
 * The content design system's only card. Every format is rendered with these
 * fixed regions, in this order: brand bar, kicker, title, body, source field,
 * footer. Text sizes and spacing come from the canvas tokens (container units),
 * so the preview, the screen and the print output are the same layout.
 */

const sz = (token: string): CSSProperties => ({ fontSize: `var(--cs-${token})` });

function BrandBar({ firmName, formatLabel }: { firmName: string; formatLabel: string }) {
  const name = firmName.trim();
  return (
    <header className="flex items-center justify-between gap-[2cqw] border-b-[0.35cqw] border-accent pb-[2cqw]" style={sz("meta")}>
      <div className="flex min-w-0 items-center gap-[1.6cqw]">
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center rounded-[0.8cqw] bg-primary font-semibold text-accent"
          style={{ width: "6.4cqw", height: "6.4cqw", fontSize: "var(--cs-kicker)" }}
        >
          {brandMonogram(name)}
        </span>
        <span className={cn("truncate font-semibold", name ? "text-primary" : "text-muted-foreground")} data-slot="brand">
          {name || `[${BRAND_PLACEHOLDER}]`}
        </span>
      </div>
      <span className="shrink-0 text-muted-foreground">{formatLabel}</span>
    </header>
  );
}

function Block({ block }: { block: ViewBlock }) {
  if (block.kind === "source_quote") {
    return (
      <figure className="border-s-[0.6cqw] border-accent bg-accent-soft/60 px-[2.4cqw] py-[1.4cqw]" data-kind="source_quote">
        <blockquote className="font-serif text-foreground" style={{ ...sz("quote"), lineHeight: "var(--cs-lead-body)" }}>
          «{block.text}»
        </blockquote>
        {block.citation ? (
          <figcaption className="mt-[0.8cqw] text-muted-foreground" style={sz("meta")}>
            نص المصدر: <bdi>{block.citation}</bdi>
          </figcaption>
        ) : null}
      </figure>
    );
  }
  return (
    <p className="whitespace-pre-line text-foreground" style={{ ...sz("body"), lineHeight: "var(--cs-lead-body)" }} data-kind={block.kind}>
      {block.text}
    </p>
  );
}

function SourceField({ attribution }: { attribution: string }) {
  return (
    <p className="border-t border-border pt-[1.4cqw] text-muted-foreground" style={sz("meta")} data-slot="source">
      <span className="font-semibold text-foreground">المصدر: </span>
      <bdi>{attribution}</bdi>
    </p>
  );
}

function Footer({ page, approved }: { page: string | null; approved: boolean }) {
  return (
    <footer className="flex items-center justify-between gap-[2cqw] pt-[1.2cqw] text-muted-foreground" style={sz("meta")}>
      <span>{CONTENT_DISCLAIMER}</span>
      <span className="flex shrink-0 items-center gap-[1.4cqw]">
        {approved ? null : (
          <span className="rounded-[0.6cqw] border border-verify/40 bg-verify-soft px-[1cqw] font-semibold text-verify" data-slot="draft">
            {DRAFT_MARK}
          </span>
        )}
        {page ? <span className="tabular">{page}</span> : null}
      </span>
    </footer>
  );
}

function Sections({ cards }: { cards: ViewCard[] }) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--cs-section)" }}>
      {cards.map((card) => (
        <section key={card.id} className="flex flex-col" style={{ gap: "var(--cs-block)" }}>
          {card.heading ? (
            <h3 className="font-semibold text-primary" style={{ ...sz("heading"), lineHeight: "var(--cs-lead-heading)" }}>
              {card.heading}
            </h3>
          ) : null}
          {card.blocks.map((block) => (
            <Block key={block.id} block={block} />
          ))}
        </section>
      ))}
    </div>
  );
}

interface FrameProps {
  canvas: CanvasTokens;
  children: ReactNode;
  /** Documents grow with their content; slides and cards have a fixed size. */
  fixed: boolean;
  label: string;
  innerRef?: (node: HTMLDivElement | null) => void;
}

/** The canvas: fixed aspect ratio (or A4 width for documents) and the token variables. */
export function CardFrame({ canvas, children, fixed, label, innerRef }: FrameProps) {
  return (
    <article aria-label={label} className="cs-card w-full bg-white" style={{ containerType: "inline-size" }}>
      <div
        ref={innerRef}
        className="flex flex-col overflow-hidden"
        style={{
          ...(canvasStyle(canvas) as CSSProperties),
          padding: "var(--cs-pad)",
          gap: "var(--cs-block)",
          ...(fixed && canvas.height ? { aspectRatio: `${canvas.width} / ${canvas.height}` } : { minHeight: `${(1123 / 794) * 100}cqw` }),
        }}
      >
        {children}
      </div>
    </article>
  );
}

interface ContentCardsProps {
  view: ContentView;
  approved: boolean;
  /** Called with each fixed card's inner element, to detect text overflow in the editor. */
  measure?: (cardId: string, node: HTMLDivElement | null) => void;
}

/** Renders a piece of content in its format's layout. */
export function ContentCards({ view, approved, measure }: ContentCardsProps) {
  const { spec, canvas } = view;
  const formatLabel = spec.label;

  if (spec.layout === "slides") {
    const total = view.cards.length;
    return (
      <>
        {view.cards.map((card, index) => {
          const isCover = index === 0;
          return (
            <CardFrame key={card.id} canvas={canvas} fixed label={`${card.kicker} — ${index + 1} من ${total}`} innerRef={measure ? (n) => measure(card.id, n) : undefined}>
              <BrandBar firmName={view.firmName} formatLabel={formatLabel} />
              <p className="font-semibold text-accent" style={sz("kicker")}>
                {card.kicker}
              </p>
              {isCover ? (
                <h2 className="font-bold text-primary" style={{ ...sz("display"), lineHeight: "var(--cs-lead-display)" }}>
                  {view.title}
                </h2>
              ) : null}
              {card.heading && !card.isSource ? (
                <h3 className={cn("font-semibold", isCover ? "text-foreground" : "text-primary")} style={{ ...sz(isCover ? "body" : "heading"), lineHeight: "var(--cs-lead-heading)" }}>
                  {card.heading}
                </h3>
              ) : null}
              <div className="flex flex-col" style={{ gap: "var(--cs-block)" }}>
                {card.isSource ? (
                  <>
                    <p className="font-semibold text-primary" style={{ ...sz("heading"), lineHeight: "var(--cs-lead-heading)" }}>
                      <bdi>{view.attribution}</bdi>
                    </p>
                    {card.sourceLines.length > 0 ? (
                      <ul className="list-disc ps-[3cqw] text-muted-foreground" style={{ ...sz("body"), lineHeight: "var(--cs-lead-body)" }}>
                        {card.sourceLines.map((line) => (
                          <li key={line}>
                            <bdi>{line}</bdi>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  card.blocks.map((block) => <Block key={block.id} block={block} />)
                )}
              </div>
              <div className="flex-1" />
              {card.isSource ? null : <SourceField attribution={view.attribution} />}
              <Footer page={`${index + 1}/${total}`} approved={approved} />
            </CardFrame>
          );
        })}
      </>
    );
  }

  // One card (square post) or one flowing document: sections stacked under the title.
  const sections = view.cards.filter((c) => !c.isSource);
  const quoted = view.cards.find((c) => c.isSource)?.sourceLines ?? [];
  const fixed = spec.layout === "card";
  return (
    <CardFrame canvas={canvas} fixed={fixed} label={view.title} innerRef={measure && fixed ? (n) => measure("single", n) : undefined}>
      <BrandBar firmName={view.firmName} formatLabel={formatLabel} />
      <h2 className="font-bold text-primary" style={{ ...sz("display"), lineHeight: "var(--cs-lead-display)" }}>
        {view.title}
      </h2>
      <Sections cards={sections} />
      <div className="flex-1" />
      <SourceField attribution={quoted.length > 0 ? `${view.attribution} — ${quoted.join("؛ ")}` : view.attribution} />
      <Footer page={null} approved={approved} />
    </CardFrame>
  );
}
