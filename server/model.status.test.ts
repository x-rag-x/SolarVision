import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("model.status", () => {
  it("reports checkpoint state without inventing evaluation metrics", async () => {
    const result = await appRouter.createCaller(createContext()).model.status();
    expect(result.modelName).toBe("YOLO26n");
    expect(typeof result.exists).toBe("boolean");
    expect(result.independentMetricsStatus).toContain("No independent test metrics provided");
    expect(result.classNames).toEqual([]);
  });
});
