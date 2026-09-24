import { float, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const inspections = mysqlTable("inspections", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: varchar("inspectionId", { length: 64 }).notNull().unique(),
  sourceFilename: varchar("sourceFilename", { length: 255 }).notNull(),
  modelName: varchar("modelName", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["completed", "failed"]).notNull(),
  processingTimeMs: float("processingTimeMs").notNull(),
  inputImageUrl: text("inputImageUrl"),
  annotatedImageUrl: text("annotatedImageUrl"),
  detectionsCount: int("detectionsCount").notNull().default(0),
  persistenceStatus: varchar("persistenceStatus", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const detections = mysqlTable("detections", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: varchar("inspectionId", { length: 64 }).notNull(),
  defectType: varchar("defectType", { length: 128 }).notNull(),
  confidence: float("confidence").notNull(),
  x1: float("x1").notNull(),
  y1: float("y1").notNull(),
  x2: float("x2").notNull(),
  y2: float("y2").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Inspection = typeof inspections.$inferSelect;
export type Detection = typeof detections.$inferSelect;
