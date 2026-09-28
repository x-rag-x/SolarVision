# SolarVision AI

SolarVision AI is an evidence-first smart-manufacturing application for automated solar-cell EL/NIR defect inspection. The workspace combines a React operator console, typed server procedures, a Python FastAPI inference service, a YOLO26n checkpoint, managed image storage, and database-backed inspection history and analytics.

## What is implemented

The M1 workflow is intentionally real-data-only: upload an image, run the configured YOLO checkpoint, return model-produced bounding boxes and confidence scores, render an annotated image, persist metadata and detections when database/storage credentials are available, and display the result in the dashboard. No synthetic inspection rows, production counts, sensor values, machine-health scores, root causes, or evaluation metrics are embedded in the UI.

The application includes the following routes:

| Route | Purpose |
| --- | --- |
| `/` | Overview dashboard with persisted KPIs, runtime state, workflow steps, and latest activity |
| `/inspection` | Image upload, YOLO inspection action, annotated result, confidence, and bounding-box review |
| `/history` | Database-backed inspection traceability table |
| `/analytics` | Defect-type counts, average confidence, and daily inspection trend from stored records |
| `/model` | Checkpoint readiness and independent-metrics provenance |
| `/roadmap` | M2 root-cause, M3 predictive maintenance, and M4 connected-factory extension points |

## Architecture

```text
Solar cell / EL-NIR image
        |
        v
React + TypeScript operator console
        |
        v
tRPC server procedures (`server/routers.ts`)
        |
        +--> Python bridge (`python3 -m backend.app.infer_cli`)
        |        |
        |        +--> FastAPI / Ultralytics YOLO26n service (`backend/app`)
        |        +--> real bounding boxes + confidence + annotated image
        |
        +--> managed storage or Supabase Storage
        +--> Drizzle database or Supabase Postgres adapter
        |
        v
History, defect analytics, model status, future ML extension points
```

The WebDev preview runs as one Node process. The Node inspection bridge invokes the Python CLI synchronously for a request, which keeps the preview compatible with the managed runtime. For a dedicated deployment, the FastAPI service can run as its own process or be folded into a custom image with the Python dependencies installed.

## Technology stack

- React 19, TypeScript, Tailwind CSS, Wouter, Recharts
- Express, tRPC, Drizzle ORM, MySQL/TiDB-compatible default project database
- FastAPI, OpenCV, Pillow, Ultralytics, NumPy
- Supabase REST adapter and SQL schema for Postgres + private Storage bucket
- Uploaded YOLO checkpoint: `backend/models/best.pt`

## Project structure

```text
backend/
  app/
    config.py             # runtime configuration
    inference.py          # checkpoint loading, prediction, annotation
    infer_cli.py          # Node bridge entry point
    main.py               # standalone FastAPI app
    schemas.py            # typed API models
  models/best.pt          # uploaded trained checkpoint
  requirements.txt
client/src/
  components/DashboardLayout.tsx
  components/solarvision/Primitives.tsx
  pages/Home.tsx
  pages/Inspection.tsx
  pages/History.tsx
  pages/Analytics.tsx
  pages/ModelPerformance.tsx
  pages/Roadmap.tsx
server/
  db.ts                   # persistence repositories
  routers.ts              # typed API procedures
  inspection/service.ts   # inference + storage + persistence orchestration
  inspection/supabase.ts  # optional Supabase REST adapter
  storage.ts              # managed file storage helper
supabase/schema.sql       # Postgres tables and private bucket setup
drizzle/schema.ts         # WebDev database schema
```

## Model setup

The uploaded checkpoint is already copied to `backend/models/best.pt`. The actual path is configurable and is never hard-coded in the inference service.

```bash
export MODEL_PATH=backend/models/best.pt
export CONFIDENCE_THRESHOLD=0.25
export IMAGE_SIZE=640
```

If the configured checkpoint is missing, the FastAPI app fails startup with:

> YOLO model not found. Please place best.pt in the configured model path.

The model class labels are read from the checkpoint at runtime. Independent precision, recall, mAP, and confusion-matrix values are not inferred from the checkpoint; provide a held-out evaluation report before adding those values to the model registry.

### Training configuration status

The delivered project contains the trained checkpoint but no dataset YAML, training script, augmentation configuration, training/validation manifest, or polarity-conversion record. The checkpoint metadata does embed `imgsz=640`, `iou=0.7`, `max_det=300`, `rect=false`, `augment=false`, `val=true`, `split=val`, `epochs=50`, `batch=16`, and the dataset reference `/content/solar_dataset/data.yaml`. It also records standard Ultralytics training arguments including HSV augmentation, horizontal flip, scale/translate, mosaic, RandAugment, and erasing settings. These are checkpoint metadata, not a substitute for the missing dataset or source script. The following remain **unavailable from project evidence**: training image sources, actual RGB versus grayscale input, image polarity, native EL dimensions, dataset YAML contents, and labeled train/validation file lists. The checkpoint metadata confirms the nine class labels, but it does not establish real-world accuracy or the dataset domain.

At inference, the service passes the uploaded OpenCV image directly to Ultralytics `model.predict` with `imgsz=640`, `iou=0.70`, and the production `conf=0.25`. Ultralytics performs its standard resize/letterbox and tensor normalization. No application-level grayscale conversion, polarity inversion, contrast adjustment, or custom normalization is applied. This is compatible with a normal RGB/BGR image path, but compatibility with a grayscale or polarity-transformed training pipeline cannot be confirmed without the original training configuration.

## FastAPI backend

Create a Python environment and install the inference dependencies:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
uvicorn backend.app.main:app --reload --port 8000
```

Useful endpoints:

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Model path and readiness check |
| `GET` | `/model` | Runtime model status and class labels |
| `POST` | `/inspect` | Multipart image upload and real YOLO inference |

Example:

```bash
curl -X POST http://localhost:8000/inspect \
  -F "file=@/path/to/cell-image.png"
```

For development diagnostics, the CLI can compare the unchanged model at the standard threshold and lower thresholds without changing the production default:

```bash
backend/.venv/bin/python -m backend.app.infer_cli \
  --input /path/to/el-image.png \
  --annotated /tmp/standard-annotated.jpg \
  --diagnostic \
  --diagnostic-dir /tmp/solarvision-diagnostics \
  --json /tmp/diagnostic-result.json
```

The diagnostic JSON reports that pre-NMS raw tensors are unavailable through the public Ultralytics result used by this service, the NMS-filtered candidate count obtained at `conf=0.001`, final results at `0.25`, `0.10`, `0.05`, and `0.01`, image dimensions and pixel statistics, a polarity heuristic, class names, image size, confidence threshold, and IoU/NMS threshold. The CLI writes `annotated-conf-0.25.jpg`, `annotated-conf-0.10.jpg`, `annotated-conf-0.05.jpg`, and `annotated-conf-0.01.jpg` under the diagnostic directory. Candidate counts are not validated defects. The standard production threshold remains `0.25` unless `CONFIDENCE_THRESHOLD` is explicitly configured.

### Suitable domain-validation image

To validate this checkpoint for solar manufacturing, provide an original unannotated EL or NIR image from the intended camera and process, preferably with the native dimensions and bit depth preserved. Include known defect labels or bounding-box annotations when available, plus the cell orientation and any information about image polarity, grayscale/RGB encoding, exposure, cropping, and resizing. A single unlabeled image can test execution and qualitative alignment, but it cannot establish precision, recall, mAP, or defect-free status. Accuracy claims require a representative labeled held-out EL/NIR set that matches the training domain.

## Web application

```bash
cd /home/ubuntu/solarvision-ai
pnpm install
pnpm check
pnpm dev
```

The WebDev preview server is available through the project preview URL. The frontend uses tRPC hooks for all application data calls; there are no client-side Axios wrappers.

The current operator workflow includes `/inspect` as an alias for `/inspection`, `/inspection/:inspectionId` for persisted evidence review, and `/settings` for local operator preferences and runtime status. The Python service preserves `/health`, `/model`, and `/inspect`, and now also exposes `/api/health`, `/api/model`, and `/api/inspections` for REST clients. Inspection responses include detection summaries, confidence aggregates, local image URLs, and the annotated image data URL.

### Custom notifications

The dashboard header includes a persistent Operations Inbox. It shows pipeline readiness, Supabase connectivity, model-evaluation reminders, and inspection completion or failure events. Operators can mark items read, open the linked workflow, clear history, or dismiss the panel. Inspection events are emitted through the typed `solarvision:notification` browser event contract in `client/src/components/solarvision/notification-model.ts`.

### Deployment reliability

The production image uses `.dockerignore` to exclude local `node_modules`, build outputs, logs, and virtual environments from the upload context. The custom Dockerfile installs CPU-only PyTorch wheels and uses frozen pnpm dependencies, avoiding the CUDA-heavy default wheel and reducing deployment build time. The trained checkpoint remains included under `backend/models/best.pt` for the Python inference bridge.

## Supabase setup

SolarVision AI is connected to the Supabase project `njpaifezreokzdczfszr` in `ap-northeast-2`. The connected schema has been applied through the Supabase MCP migration tool. It creates `inspections`, `detections`, indexes, RLS policies, and the private `solarvision-images` Storage bucket.

The current deployment uses the active Supabase anon/publishable key with explicit RLS policies:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_STORAGE_BUCKET=solarvision-images
```

The adapter also supports `SUPABASE_SERVICE_ROLE_KEY` when a server-only key is intentionally supplied. That key is required for direct Supabase Storage uploads; without it, images use the managed WebDev storage fallback while metadata and detections can still persist through RLS-scoped Postgres REST writes. Never expose a service-role key to the browser.

The WebDev template includes a managed S3-compatible storage helper. When Supabase credentials are absent, the app labels the persistence state explicitly. If neither storage nor a database is configured, the UI remains empty rather than inventing records.

## Database setup

For the WebDev database, generate and apply the Drizzle migration:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

The schema contains `users`, `inspections`, and `detections`. The inspection repository calculates counts, average latency, label distribution, and daily trend directly from persisted rows.

## Inference workflow

1. The operator selects an image in `client/src/pages/Inspection.tsx`.
2. The browser converts the image to base64 and calls `inspection.run`.
3. The Node server writes request bytes to a bounded temporary directory.
4. The Node server runs `python3 -m backend.app.infer_cli`.
5. `YoloInferenceService` loads `MODEL_PATH`, executes Ultralytics prediction, parses boxes/confidence/class IDs, and draws annotations with OpenCV.
6. The bridge uploads original and annotated images to Supabase Storage when configured; otherwise it attempts managed storage.
7. Inspection metadata and every detection are written through the Drizzle repository. Supabase Postgres synchronization is attempted when configured.
8. The procedure returns the annotated image and raw detection values to React.
9. History and analytics query stored records; empty states remain explicit when no records exist.

## M2 / M3 / M4 extension plan

**M2 — Root-cause analysis.** Add a machine-event table keyed by machine ID and UTC event windows. Join sensor aggregates to inspection IDs and defect labels. Train Random Forest/XGBoost only after a verified labeled dataset exists. Store model version, feature snapshot, and explanation metadata with every prediction.

**M3 — Predictive maintenance.** Add maintenance work orders, failure labels, asset health snapshots, and prediction horizons. Surface recommended actions only when a validated model emits a prediction with a confidence, model version, and timestamped input window.

**M4 — Connected factory.** Integrate MES/SCADA/PLC event streams, role-based approvals, notifications, and audit trails. Keep the inspection ID as the stable traceability key so quality evidence can be followed from image to machine context to maintenance action.

## Troubleshooting

- **Model not found:** verify `MODEL_PATH` and that `backend/models/best.pt` exists.
- **Inference unavailable in WebDev preview:** install `backend/requirements.txt` in the runtime that hosts the Node bridge, or run the FastAPI service separately and point the bridge at a dedicated service.
- **Database is empty:** this is expected until migrations are applied and an inspection completes successfully.
- **Supabase says integration pending:** configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the `solarvision-images` bucket schema.
- **Metrics are blank:** independent evaluation data was not provided with the checkpoint. The app deliberately does not estimate it from inference output.

## Verification checklist

```bash
pnpm check
pnpm test
pnpm build
```

Then start the FastAPI service, upload one real solar-cell image from `/inspection`, verify the annotated image and detections, confirm a row in `inspections`, confirm rows in `detections`, and check `/history` and `/analytics`. The checkpoint itself is not a substitute for an independent test report.
