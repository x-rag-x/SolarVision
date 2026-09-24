import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { detections, inspections, InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getSupabaseDashboardStats, getSupabaseDefectAnalytics, getSupabaseRecentInspections } from "./inspection/supabase";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function saveInspection(input: typeof inspections.$inferInsert, items: Array<typeof detections.$inferInsert>) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(inspections).values(input);
  if (items.length > 0) await db.insert(detections).values(items);
  return true;
}

export async function getRecentInspections(limit = 25) {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    try {
      const rows = await getSupabaseRecentInspections(limit);
      if (rows) return rows;
    } catch (error) {
      console.warn("[Supabase] Falling back to WebDev history:", error);
    }
  }
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inspections).orderBy(desc(inspections.createdAt)).limit(limit);
}

export async function getInspectionById(inspectionId: string) {
  const db = await getDb();
  if (!db) return null;
  const inspection = (await db.select().from(inspections).where(eq(inspections.inspectionId, inspectionId)).limit(1))[0];
  if (!inspection) return null;
  const items = await db.select().from(detections).where(eq(detections.inspectionId, inspectionId)).limit(200);
  return { inspection, detections: items };
}

export async function getDashboardStats() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    try {
      const stats = await getSupabaseDashboardStats();
      if (stats) return stats;
    } catch (error) {
      console.warn("[Supabase] Falling back to WebDev dashboard stats:", error);
    }
  }
  const db = await getDb();
  if (!db) return { configured: false, inspections: 0, detections: 0, avgProcessingTimeMs: null as number | null, defectTypes: 0 };
  const [inspectionCount] = await db.select({ value: sql<number>`count(*)` }).from(inspections);
  const [detectionCount] = await db.select({ value: sql<number>`count(*)` }).from(detections);
  const [avgTime] = await db.select({ value: sql<number | null>`avg(${inspections.processingTimeMs})` }).from(inspections);
  const [typeCount] = await db.select({ value: sql<number>`count(distinct ${detections.defectType})` }).from(detections);
  return { configured: true, inspections: Number(inspectionCount?.value ?? 0), detections: Number(detectionCount?.value ?? 0), avgProcessingTimeMs: avgTime?.value == null ? null : Number(avgTime.value), defectTypes: Number(typeCount?.value ?? 0) };
}

export async function getDefectAnalytics() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    try {
      const analytics = await getSupabaseDefectAnalytics();
      if (analytics) return analytics;
    } catch (error) {
      console.warn("[Supabase] Falling back to WebDev analytics:", error);
    }
  }
  const db = await getDb();
  if (!db) return { configured: false, byType: [], recentTrend: [] };
  const detectionRows = await db.select({ defectType: detections.defectType, confidence: detections.confidence }).from(detections).limit(5000);
  const byTypeMap = new Map<string, { count: number; confidenceTotal: number }>();
  for (const row of detectionRows) {
    const current = byTypeMap.get(row.defectType) ?? { count: 0, confidenceTotal: 0 };
    current.count += 1;
    current.confidenceTotal += Number(row.confidence);
    byTypeMap.set(row.defectType, current);
  }
  const byType = Array.from(byTypeMap.entries()).map(([defectType, values]) => ({ defectType, count: values.count, avgConfidence: values.count ? values.confidenceTotal / values.count : 0 })).sort((a, b) => b.count - a.count).slice(0, 50);
  const inspectionRows = await db.select({ createdAt: inspections.createdAt, detectionsCount: inspections.detectionsCount }).from(inspections).orderBy(desc(inspections.createdAt)).limit(5000);
  const trendMap = new Map<string, { inspections: number; detections: number }>();
  for (const row of inspectionRows) {
    const day = new Date(row.createdAt).toISOString().slice(0, 10);
    const current = trendMap.get(day) ?? { inspections: 0, detections: 0 };
    current.inspections += 1;
    current.detections += Number(row.detectionsCount);
    trendMap.set(day, current);
  }
  const recentTrend = Array.from(trendMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).map(([day, values]) => ({ day, ...values }));
  return { configured: true, byType, recentTrend };
}
