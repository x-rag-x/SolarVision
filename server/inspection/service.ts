import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { saveInspection } from "../db";
import { storagePut } from "../storage";
import { isSupabaseConfigured, persistToSupabase, uploadToSupabase } from "./supabase";

export type RunInspectionInput = { filename: string; mimeType: string; base64Data: string };

function runProcess(args: string[], cwd: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const localPython = process.platform === "win32" ? join(cwd, "backend/.venv/Scripts/python.exe") : join(cwd, "backend/.venv/bin/python3");
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || (existsSync(localPython) ? localPython : process.platform === "win32" ? "python" : "python3");
    const child = spawn(pythonExecutable, args, { cwd, env: { ...process.env, PYTHONPATH: cwd } });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolvePromise() : reject(new Error(stderr || `Inference process exited with code ${code}`)));
  });
}

export async function runInspection(input: RunInspectionInput) {
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
    const result = JSON.parse(await readFile(resultPath, "utf-8")) as { processing_time_ms: number; detections: Array<{ defect_type: string; confidence: number; x1: number; y1: number; x2: number; y2: number }>; annotated_image_data_url: string; inference_configuration?: { confidence_threshold: number } };
    const annotatedBuffer = await readFile(annotatedPath);
    let inputImageUrl: string | null = null;
    let annotatedImageUrl: string | null = null;
    const persistenceNotes: string[] = [];
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
      status: "completed" as const,
      processingTimeMs: result.processing_time_ms,
      inputImageUrl,
      annotatedImageUrl,
      detectionsCount: result.detections.length,
      persistenceStatus: persistenceNotes.join(",") || "storage_not_configured",
    };
    try {
      const stored = await saveInspection(databasePayload, result.detections.map(item => ({ inspectionId, defectType: item.defect_type, confidence: item.confidence, x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 })));
      if (stored) persistenceNotes.push("database");
      else persistenceNotes.push("database_not_configured");
    } catch (databaseError) {
      persistenceNotes.push(`database_error:${databaseError instanceof Error ? databaseError.message : "unknown"}`);
    }
    if (isSupabaseConfigured()) {
      try {
        await persistToSupabase({ inspection_id: inspectionId, source_filename: input.filename, model_name: "YOLO26n", status: "completed", processing_time_ms: result.processing_time_ms, input_image_url: inputImageUrl, annotated_image_url: annotatedImageUrl, detections_count: result.detections.length, persistence_status: persistenceNotes.join(",") }, result.detections.map(item => ({ inspection_id: inspectionId, defect_type: item.defect_type, confidence: item.confidence, x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 })));
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
