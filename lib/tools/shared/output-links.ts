import type { ToolType } from "@/types/database";
import type { ToolId } from "@/types/legal";

/** Database tool_type → the tool's route id. */
export const TOOL_ID_BY_TYPE: Record<ToolType, ToolId> = {
  legal_memo: "legal-memo",
  casemap: "casemap",
  contract_compass: "contract-compass",
  regdelta: "regdelta",
  matter_intake: "matter-intake",
  legal_content: "legal-content",
};

/** Where a saved output opens (null is kept for a future tool without an output page). */
export function outputHref(toolType: ToolType, outputId: string): string | null {
  switch (toolType) {
    case "matter_intake":
      return `/tools/matter-intake/brief/${outputId}`;
    default:
      return `/tools/${TOOL_ID_BY_TYPE[toolType]}/${outputId}`;
  }
}
