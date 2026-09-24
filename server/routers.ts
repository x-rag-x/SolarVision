import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getDashboardStats, getDefectAnalytics, getInspectionById, getRecentInspections } from "./db";
import { runInspection } from "./inspection/service";
import { isSupabaseConfigured } from "./inspection/supabase";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const inspectionInput = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().startsWith("image/"),
  base64Data: z.string().min(100).max(20_000_000),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    stats: publicProcedure.query(() => getDashboardStats()),
  }),
  inspection: router({
    run: publicProcedure.input(inspectionInput).mutation(async ({ input }) => {
      try {
        return await runInspection(input);
      } catch (error) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Inspection failed" });
      }
    }),
    history: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).optional()).query(({ input }) => getRecentInspections(input?.limit ?? 25)),
    detail: publicProcedure.input(z.object({ inspectionId: z.string().uuid() })).query(({ input }) => getInspectionById(input.inspectionId)),
  }),
  analytics: router({
    defects: publicProcedure.query(() => getDefectAnalytics()),
  }),
  model: router({
    status: publicProcedure.query(() => {
      const modelPath = process.env.MODEL_PATH || resolve(process.cwd(), "backend/models/best.pt");
      const exists = existsSync(modelPath);
      return { status: exists ? "checkpoint_present_runtime_inference_requires_python" : "model_missing", modelPath, exists, modelName: "YOLO26n", classNames: [], independentMetricsStatus: "No independent test metrics provided", supabaseConfigured: isSupabaseConfigured() };
    }),
  }),
});

export type AppRouter = typeof appRouter;
