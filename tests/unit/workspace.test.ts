import { describe, expect, it } from "vitest";
import { parseContractView } from "@/lib/tools/contract-compass/view";
import { outputHref, TOOL_ID_BY_TYPE } from "@/lib/tools/shared/output-links";
import { REVIEW_ACTION_LABELS } from "@/lib/tools/shared/review";
import { SOURCE_KIND_LABELS } from "@/lib/tools/shared/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
import { toolTypeSchema } from "@/lib/validation/schemas";

const ID = "6711af12-7723-47d0-9fbd-8d48e680800a";

describe("output links", () => {
  it("opens each stored output in its own tool page", () => {
    expect(outputHref("legal_memo", ID)).toBe(`/tools/legal-memo/${ID}`);
    expect(outputHref("casemap", ID)).toBe(`/tools/casemap/${ID}`);
    expect(outputHref("contract_compass", ID)).toBe(`/tools/contract-compass/${ID}`);
    expect(outputHref("regdelta", ID)).toBe(`/tools/regdelta/${ID}`);
    expect(outputHref("matter_intake", ID)).toBe(`/tools/matter-intake/brief/${ID}`);
  });

  it("has no page for a tool that is not built yet", () => {
    expect(outputHref("legal_content", ID)).toBeNull();
  });

  it("maps every tool type the database accepts", () => {
    for (const type of toolTypeSchema.options) expect(TOOL_ID_BY_TYPE[type]).toBeTruthy();
  });
});

describe("shared labels", () => {
  it("the approve action is not memo-specific (every tool uses it)", () => {
    expect(REVIEW_ACTION_LABELS.approved).toBe("اعتماد");
  });

  it("names every source kind (used by server pages, so it lives outside client modules)", () => {
    expect(Object.keys(SOURCE_KIND_LABELS).sort()).toEqual(
      ["audio_recording", "client_statement", "document", "intake_form", "lawyer_notes", "meeting_transcript", "pasted_text"].sort(),
    );
  });
});

describe("parseContractView", () => {
  it("accepts known views and falls back to the snapshot", () => {
    expect(parseContractView("deadlines")).toBe("deadlines");
    expect(parseContractView("nope")).toBe("snapshot");
    expect(parseContractView(null)).toBe("snapshot");
  });
});

describe("timestamp formatting", () => {
  it("formats in the fixed display zone, so server and browser render the same text", () => {
    // 21:30 UTC is already the next day in Riyadh (UTC+3).
    expect(formatDate("2026-11-15T21:30:00Z")).toBe(formatDate("2026-11-16T09:00:00Z"));
    expect(formatDateTime("2026-11-15T21:30:00Z")).toContain("12:30");
  });
});
