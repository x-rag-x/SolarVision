// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { float, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var inspections = mysqlTable("inspections", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var detections = mysqlTable("detections", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: varchar("inspectionId", { length: 64 }).notNull(),
  defectType: varchar("defectType", { length: 128 }).notNull(),
  confidence: float("confidence").notNull(),
  x1: float("x1").notNull(),
  y1: float("y1").notNull(),
  x2: float("x2").notNull(),
  y2: float("y2").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/inspection/supabase.ts
function getConfig() {
  const url = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !apiKey) return null;
  return { url: url.replace(/\/+$/, ""), apiKey, bucket: process.env.SUPABASE_STORAGE_BUCKET || "solarvision-images", canUpload: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) };
}
async function request(path3, init) {
  const config = getConfig();
  if (!config) throw new Error("Supabase is not configured");
  const response = await fetch(`${config.url}${path3}`, { ...init, headers: { apikey: config.apiKey, Authorization: `Bearer ${config.apiKey}`, ...init?.headers || {} } });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return response.json();
}
function inspectionQuery(limit) {
  return `?select=inspection_id,source_filename,model_name,status,processing_time_ms,input_image_url,annotated_image_url,detections_count,persistence_status,created_at&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 5e3))}`;
}
async function getSupabaseRecentInspections(limit = 25) {
  if (!getConfig()) return null;
  const rows = await request(`/rest/v1/inspections${inspectionQuery(limit)}`);
  return rows.map((row) => ({ inspectionId: row.inspection_id, sourceFilename: row.source_filename, modelName: row.model_name, status: row.status, processingTimeMs: row.processing_time_ms, inputImageUrl: row.input_image_url, annotatedImageUrl: row.annotated_image_url, detectionsCount: row.detections_count, persistenceStatus: row.persistence_status, createdAt: new Date(row.created_at) }));
}
async function getSupabaseDashboardStats() {
  if (!getConfig()) return null;
  const inspectionRows = await request(`/rest/v1/inspections?select=processing_time_ms,detections_count&limit=5000`);
  const detectionRows = await request(`/rest/v1/detections?select=defect_type&limit=5000`);
  const totalTime = inspectionRows.reduce((sum, row) => sum + Number(row.processing_time_ms), 0);
  return { configured: true, inspections: inspectionRows.length, detections: inspectionRows.reduce((sum, row) => sum + Number(row.detections_count), 0), avgProcessingTimeMs: inspectionRows.length ? totalTime / inspectionRows.length : null, defectTypes: new Set(detectionRows.map((row) => row.defect_type)).size };
}
async function getSupabaseDefectAnalytics() {
  if (!getConfig()) return null;
  const detectionRows = await request(`/rest/v1/detections?select=defect_type,confidence&limit=5000`);
  const byTypeMap = /* @__PURE__ */ new Map();
  for (const row of detectionRows) {
    const current = byTypeMap.get(row.defect_type) ?? { count: 0, confidenceTotal: 0 };
    current.count += 1;
    current.confidenceTotal += Number(row.confidence);
    byTypeMap.set(row.defect_type, current);
  }
  const byType = Array.from(byTypeMap.entries()).map(([defectType, values]) => ({ defectType, count: values.count, avgConfidence: values.count ? values.confidenceTotal / values.count : 0 })).sort((a, b) => b.count - a.count).slice(0, 50);
  const inspectionRows = await request(`/rest/v1/inspections?select=created_at,detections_count&order=created_at.desc&limit=5000`);
  const trendMap = /* @__PURE__ */ new Map();
  for (const row of inspectionRows) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    const current = trendMap.get(day) ?? { inspections: 0, detections: 0 };
    current.inspections += 1;
    current.detections += Number(row.detections_count);
    trendMap.set(day, current);
  }
  const recentTrend = Array.from(trendMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).map(([day, values]) => ({ day, ...values }));
  return { configured: true, byType, recentTrend };
}
async function uploadToSupabase(key, data, contentType) {
  const config = getConfig();
  if (!config?.canUpload) return null;
  const body = new Uint8Array(data);
  const response = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, apikey: config.apiKey, "Content-Type": contentType, "x-upsert": "true" },
    body
  });
  if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status})`);
  return `${config.url}/storage/v1/object/public/${config.bucket}/${key}`;
}
async function persistToSupabase(payload, detectionRows) {
  const config = getConfig();
  if (!config) return false;
  const headers = { Authorization: `Bearer ${config.apiKey}`, apikey: config.apiKey, "Content-Type": "application/json", Prefer: "return=minimal" };
  const inspectionResponse = await fetch(`${config.url}/rest/v1/inspections`, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!inspectionResponse.ok) throw new Error(`Supabase inspection insert failed (${inspectionResponse.status})`);
  if (detectionRows.length > 0) {
    const detectionResponse = await fetch(`${config.url}/rest/v1/detections`, { method: "POST", headers, body: JSON.stringify(detectionRows) });
    if (!detectionResponse.ok) throw new Error(`Supabase detection insert failed (${detectionResponse.status})`);
  }
  return true;
}
function isSupabaseConfigured() {
  return Boolean(getConfig());
}

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  for (const field of textFields) {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= /* @__PURE__ */ new Date();
  updateSet.lastSignedIn ??= /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
async function saveInspection(input, items) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(inspections).values(input);
  if (items.length > 0) await db.insert(detections).values(items);
  return true;
}
async function getRecentInspections(limit = 25) {
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
async function getInspectionById(inspectionId) {
  const db = await getDb();
  if (!db) return null;
  const inspection = (await db.select().from(inspections).where(eq(inspections.inspectionId, inspectionId)).limit(1))[0];
  if (!inspection) return null;
  const items = await db.select().from(detections).where(eq(detections.inspectionId, inspectionId)).limit(200);
  return { inspection, detections: items };
}
async function getDashboardStats() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    try {
      const stats = await getSupabaseDashboardStats();
      if (stats) return stats;
    } catch (error) {
      console.warn("[Supabase] Falling back to WebDev dashboard stats:", error);
    }
  }
  const db = await getDb();
  if (!db) return { configured: false, inspections: 0, detections: 0, avgProcessingTimeMs: null, defectTypes: 0 };
  const [inspectionCount] = await db.select({ value: sql`count(*)` }).from(inspections);
  const [detectionCount] = await db.select({ value: sql`count(*)` }).from(detections);
  const [avgTime] = await db.select({ value: sql`avg(${inspections.processingTimeMs})` }).from(inspections);
  const [typeCount] = await db.select({ value: sql`count(distinct ${detections.defectType})` }).from(detections);
  return { configured: true, inspections: Number(inspectionCount?.value ?? 0), detections: Number(detectionCount?.value ?? 0), avgProcessingTimeMs: avgTime?.value == null ? null : Number(avgTime.value), defectTypes: Number(typeCount?.value ?? 0) };
}
async function getDefectAnalytics() {
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
  const detectionRows = await db.select({ defectType: detections.defectType, confidence: detections.confidence }).from(detections).limit(5e3);
  const byTypeMap = /* @__PURE__ */ new Map();
  for (const row of detectionRows) {
    const current = byTypeMap.get(row.defectType) ?? { count: 0, confidenceTotal: 0 };
    current.count += 1;
    current.confidenceTotal += Number(row.confidence);
    byTypeMap.set(row.defectType, current);
  }
  const byType = Array.from(byTypeMap.entries()).map(([defectType, values]) => ({ defectType, count: values.count, avgConfidence: values.count ? values.confidenceTotal / values.count : 0 })).sort((a, b) => b.count - a.count).slice(0, 50);
  const inspectionRows = await db.select({ createdAt: inspections.createdAt, detectionsCount: inspections.detectionsCount }).from(inspections).orderBy(desc(inspections.createdAt)).limit(5e3);
  const trendMap = /* @__PURE__ */ new Map();
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

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/inspection/service.ts
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/inspection/service.ts
function runProcess(args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const localPython = process.platform === "win32" ? join(cwd, "backend/.venv/Scripts/python.exe") : join(cwd, "backend/.venv/bin/python3");
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || (existsSync(localPython) ? localPython : process.platform === "win32" ? "python" : "python3");
    const child = spawn(pythonExecutable, args, { cwd, env: { ...process.env, PYTHONPATH: cwd } });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(stderr || `Inference process exited with code ${code}`)));
  });
}
async function runInspection(input) {
  const inspectionId = randomUUID();
  const projectRoot = resolve(process.cwd());
  const workingDir = await mkdtemp(join(tmpdir(), "solarvision-"));
  const suffix = input.filename.includes(".") ? input.filename.slice(input.filename.lastIndexOf(".")) : ".jpg";
  const inputPath = join(workingDir, `input${suffix}`);
  const annotatedPath = join(workingDir, "annotated.jpg");
  const resultPath = join(workingDir, "result.json");
  const original = Buffer.from(input.base64Data, "base64");
  await writeFile(inputPath, original);
  try {
    await runProcess(["-m", "backend.app.infer_cli", "--input", inputPath, "--annotated", annotatedPath, "--json", resultPath], projectRoot);
    const result = JSON.parse(await readFile(resultPath, "utf-8"));
    const annotatedBuffer = await readFile(annotatedPath);
    let inputImageUrl = null;
    let annotatedImageUrl = null;
    const persistenceNotes = [];
    try {
      if (isSupabaseConfigured()) {
        inputImageUrl = await uploadToSupabase(`inspections/${inspectionId}/input${suffix}`, original, input.mimeType);
        annotatedImageUrl = await uploadToSupabase(`inspections/${inspectionId}/annotated.jpg`, annotatedBuffer, "image/jpeg");
        persistenceNotes.push("supabase_storage");
      } else {
        const inputStored = await storagePut(`solarvision/${inspectionId}/input${suffix}`, original, input.mimeType);
        const annotatedStored = await storagePut(`solarvision/${inspectionId}/annotated.jpg`, annotatedBuffer, "image/jpeg");
        inputImageUrl = inputStored.url;
        annotatedImageUrl = annotatedStored.url;
        persistenceNotes.push("managed_storage");
      }
    } catch (storageError) {
      persistenceNotes.push(`storage_unavailable:${storageError instanceof Error ? storageError.message : "unknown"}`);
    }
    const databasePayload = {
      inspectionId,
      sourceFilename: input.filename,
      modelName: "YOLO26n",
      status: "completed",
      processingTimeMs: result.processing_time_ms,
      inputImageUrl,
      annotatedImageUrl,
      detectionsCount: result.detections.length,
      persistenceStatus: persistenceNotes.join(",") || "storage_not_configured"
    };
    try {
      const stored = await saveInspection(databasePayload, result.detections.map((item) => ({ inspectionId, defectType: item.defect_type, confidence: item.confidence, x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 })));
      if (stored) persistenceNotes.push("database");
      else persistenceNotes.push("database_not_configured");
    } catch (databaseError) {
      persistenceNotes.push(`database_error:${databaseError instanceof Error ? databaseError.message : "unknown"}`);
    }
    if (isSupabaseConfigured()) {
      try {
        await persistToSupabase({ inspection_id: inspectionId, source_filename: input.filename, model_name: "YOLO26n", status: "completed", processing_time_ms: result.processing_time_ms, input_image_url: inputImageUrl, annotated_image_url: annotatedImageUrl, detections_count: result.detections.length, persistence_status: persistenceNotes.join(",") }, result.detections.map((item) => ({ inspection_id: inspectionId, defect_type: item.defect_type, confidence: item.confidence, x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 })));
        persistenceNotes.push("supabase_postgres");
      } catch (supabaseError) {
        persistenceNotes.push(`supabase_postgres_error:${supabaseError instanceof Error ? supabaseError.message : "unknown"}`);
      }
    }
    return { inspectionId, sourceFilename: input.filename, modelName: "YOLO26n", processingTimeMs: result.processing_time_ms, detections: result.detections, annotatedImageUrl, annotatedImageDataUrl: result.annotated_image_data_url, persistence: persistenceNotes.join(",") || "not_persisted", inferenceConfiguration: result.inference_configuration ?? { confidence_threshold: Number(process.env.CONFIDENCE_THRESHOLD || 0.25) } };
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
}

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";
import { existsSync as existsSync2 } from "node:fs";
import { resolve as resolve2 } from "node:path";
var inspectionInput = z2.object({
  filename: z2.string().min(1).max(255),
  mimeType: z2.string().startsWith("image/"),
  base64Data: z2.string().min(100).max(2e7)
});
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  dashboard: router({
    stats: publicProcedure.query(() => getDashboardStats())
  }),
  inspection: router({
    run: publicProcedure.input(inspectionInput).mutation(async ({ input }) => {
      try {
        return await runInspection(input);
      } catch (error) {
        throw new TRPCError3({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Inspection failed" });
      }
    }),
    history: publicProcedure.input(z2.object({ limit: z2.number().int().min(1).max(100).default(25) }).optional()).query(({ input }) => getRecentInspections(input?.limit ?? 25)),
    detail: publicProcedure.input(z2.object({ inspectionId: z2.string().uuid() })).query(({ input }) => getInspectionById(input.inspectionId))
  }),
  analytics: router({
    defects: publicProcedure.query(() => getDefectAnalytics())
  }),
  model: router({
    status: publicProcedure.query(() => {
      const modelPath = process.env.MODEL_PATH || resolve2(process.cwd(), "backend/models/best.pt");
      const exists = existsSync2(modelPath);
      return { status: exists ? "checkpoint_present_runtime_inference_requires_python" : "model_missing", modelPath, exists, modelName: "YOLO26n", classNames: [], independentMetricsStatus: "No independent test metrics provided", supabaseConfigured: isSupabaseConfigured() };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve3) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve3(true));
    });
    server.on("error", () => resolve3(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
