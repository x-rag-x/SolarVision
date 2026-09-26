type SupabaseConfig = { url: string; apiKey: string; bucket: string; canUpload: boolean };

type SupabaseDetection = { inspection_id: string; defect_type: string; confidence: number; x1: number; y1: number; x2: number; y2: number };
type SupabaseInspection = { inspection_id: string; source_filename: string; model_name: string; status: "completed" | "failed"; processing_time_ms: number; input_image_url: string | null; annotated_image_url: string | null; detections_count: number; persistence_status: string; created_at: string };

function getConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !apiKey) return null;
  return { url: url.replace(/\/+$/, ""), apiKey, bucket: process.env.SUPABASE_STORAGE_BUCKET || "solarvision-images", canUpload: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error("Supabase is not configured");
  const response = await fetch(`${config.url}${path}`, { ...init, headers: { apikey: config.apiKey, Authorization: `Bearer ${config.apiKey}`, ...(init?.headers || {}) } });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function inspectionQuery(limit: number) {
  return `?select=inspection_id,source_filename,model_name,status,processing_time_ms,input_image_url,annotated_image_url,detections_count,persistence_status,created_at&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 5000))}`;
}

export async function getSupabaseRecentInspections(limit = 25) {
  if (!getConfig()) return null;
  const rows = await request<SupabaseInspection[]>(`/rest/v1/inspections${inspectionQuery(limit)}`);
  return rows.map(row => ({ inspectionId: row.inspection_id, sourceFilename: row.source_filename, modelName: row.model_name, status: row.status, processingTimeMs: row.processing_time_ms, inputImageUrl: row.input_image_url, annotatedImageUrl: row.annotated_image_url, detectionsCount: row.detections_count, persistenceStatus: row.persistence_status, createdAt: new Date(row.created_at) }));
}

export async function getSupabaseDashboardStats() {
  if (!getConfig()) return null;
  const inspectionRows = await request<Pick<SupabaseInspection, "processing_time_ms" | "detections_count">[]>(`/rest/v1/inspections?select=processing_time_ms,detections_count&limit=5000`);
  const detectionRows = await request<Pick<SupabaseDetection, "defect_type">[]>(`/rest/v1/detections?select=defect_type&limit=5000`);
  const totalTime = inspectionRows.reduce((sum, row) => sum + Number(row.processing_time_ms), 0);
  return { configured: true, inspections: inspectionRows.length, detections: inspectionRows.reduce((sum, row) => sum + Number(row.detections_count), 0), avgProcessingTimeMs: inspectionRows.length ? totalTime / inspectionRows.length : null, defectTypes: new Set(detectionRows.map(row => row.defect_type)).size };
}

export async function getSupabaseDefectAnalytics() {
  if (!getConfig()) return null;
  const detectionRows = await request<Pick<SupabaseDetection, "defect_type" | "confidence">[]>(`/rest/v1/detections?select=defect_type,confidence&limit=5000`);
  const byTypeMap = new Map<string, { count: number; confidenceTotal: number }>();
  for (const row of detectionRows) {
    const current = byTypeMap.get(row.defect_type) ?? { count: 0, confidenceTotal: 0 };
    current.count += 1;
    current.confidenceTotal += Number(row.confidence);
    byTypeMap.set(row.defect_type, current);
  }
  const byType = Array.from(byTypeMap.entries()).map(([defectType, values]) => ({ defectType, count: values.count, avgConfidence: values.count ? values.confidenceTotal / values.count : 0 })).sort((a, b) => b.count - a.count).slice(0, 50);
  const inspectionRows = await request<Pick<SupabaseInspection, "created_at" | "detections_count">[]>(`/rest/v1/inspections?select=created_at,detections_count&order=created_at.desc&limit=5000`);
  const trendMap = new Map<string, { inspections: number; detections: number }>();
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

export async function uploadToSupabase(key: string, data: Buffer, contentType: string) {
  const config = getConfig();
  if (!config?.canUpload) return null;
  const body = new Uint8Array(data);
  const response = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, apikey: config.apiKey, "Content-Type": contentType, "x-upsert": "true" },
    body: body as unknown as BodyInit,
  });
  if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status})`);
  return `${config.url}/storage/v1/object/public/${config.bucket}/${key}`;
}

export async function persistToSupabase(payload: Record<string, unknown>, detectionRows: SupabaseDetection[]) {
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

export function isSupabaseConfigured() {
  return Boolean(getConfig());
}
