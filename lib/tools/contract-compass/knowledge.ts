import "server-only";

/**
 * Legal knowledge source configuration. Contract Compass only allows
 * definitive legal conclusions (e.g. "illegal", "high risk") when a vetted
 * knowledge source is configured AND wired into the analysis. No such
 * integration exists yet, so this always returns null; setting the variable
 * alone does not enable conclusions.
 *
 *   LEGAL_KNOWLEDGE_SOURCE   reserved for a future, reviewed integration
 */
export function getLegalKnowledgeSource(): string | null {
  return null;
}
