import { describe, expect, it } from "vitest";
import { documentMetadataSchema, matterCreateSchema, matterUpdateSchema, outputCreateSchema } from "@/lib/validation/schemas";

describe("matterCreateSchema", () => {
  it("trims, nulls empty optionals and defaults status", () => {
    const parsed = matterCreateSchema.parse({ matter_name: "  نزاع  ", client_name: "  " });
    expect(parsed).toEqual({ matter_name: "نزاع", matter_type: null, client_name: null, description: null, status: "active" });
  });

  it("never carries a user_id through", () => {
    const parsed = matterCreateSchema.parse({ matter_name: "x", user_id: "someone-else" });
    expect(parsed).not.toHaveProperty("user_id");
  });

  it("requires a name and a known status", () => {
    expect(matterCreateSchema.safeParse({ matter_name: " " }).success).toBe(false);
    expect(matterCreateSchema.safeParse({ matter_name: "x", status: "deleted" }).success).toBe(false);
  });

  it("rejects empty updates", () => {
    expect(matterUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("documentMetadataSchema", () => {
  it("accepts real dates and blank values", () => {
    expect(documentMetadataSchema.parse({ document_date: "2024-02-29" }).document_date).toBe("2024-02-29");
    expect(documentMetadataSchema.parse({ document_date: "" }).document_date).toBeNull();
    expect(documentMetadataSchema.parse({}).document_date).toBeNull();
  });

  it("rejects impossible or malformed dates", () => {
    expect(documentMetadataSchema.safeParse({ document_date: "2023-02-29" }).success).toBe(false);
    expect(documentMetadataSchema.safeParse({ document_date: "29/02/2024" }).success).toBe(false);
  });
});

describe("outputCreateSchema", () => {
  it("requires a known tool type and valid reference ids", () => {
    expect(outputCreateSchema.safeParse({ tool_type: "unknown", title: "x" }).success).toBe(false);
    expect(
      outputCreateSchema.safeParse({
        tool_type: "legal_memo",
        title: "x",
        references: [{ document_id: "not-a-uuid", source_text: "y" }],
      }).success,
    ).toBe(false);
  });
});
