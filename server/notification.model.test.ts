import { describe, expect, it } from "vitest";
import { createInspectionNotification } from "../client/src/components/solarvision/notification-model";

describe("createInspectionNotification", () => {
  it("creates a success notification when no defects are found", () => {
    expect(createInspectionNotification("cell.png", 0)).toMatchObject({
      title: "Inspection completed",
      message: "cell.png returned 0 defects. Review the annotated evidence.",
      tone: "success",
      href: "/inspection",
    });
  });

  it("uses a warning tone for defects and failed runs", () => {
    expect(createInspectionNotification("cell.png", 2).tone).toBe("warning");
    expect(createInspectionNotification("cell.png", 0, "Model unavailable")).toMatchObject({
      title: "Inspection failed",
      message: "Model unavailable",
      tone: "warning",
    });
  });
});
