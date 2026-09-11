from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .cv_pipeline import run_advanced_pipeline, run_core_pipeline
from .scoring import load_and_score
from .sms_alerts import list_recipients, recent_logs, register_recipient, send_alert

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT.parent / "frontend"
MEDIA_ROOT = ROOT / "uploads"
MEDIA_ROOT.mkdir(exist_ok=True)
STATE_FILE = ROOT / "analysis_state.json"
REPORTS_FILE = ROOT / "reports.json"
#REPORTS_FILE.touch(exist_ok=True)

app = FastAPI(title="Vasunetra Disaster Management API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=MEDIA_ROOT), name="media")

ARTIFACTS = {
    "core": {
        "change_mask.jpg", "change_overlay.jpg", "heatmap.jpg",
        "aligned_after.jpg", "evidence_report.jpg", "result.json",
    },
    "advanced": {
        "aligned_after.jpg", "change_regions.jpg", "change_overlay.jpg",
        "difference.jpg", "heatmap.jpg", "final_assessment.json",
    },
}
app.mount("/official", StaticFiles(directory=FRONTEND / "official", html=True), name="official")
app.mount("/field", StaticFiles(directory=FRONTEND / "field", html=True), name="field")
app.mount("/citizen", StaticFiles(directory=FRONTEND / "citizen", html=True), name="citizen")
assets_dir = FRONTEND / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


def _clean_rows(df: pd.DataFrame):
    clean = df.copy()
    clean = clean.astype(object).where(pd.notna(clean), None)
    return clean.to_dict(orient="records")


def _save_analysis_state(village: str, land_change_score: float, payload: dict, job_id: str):
    state = {"land_change": {}, "latest": {}}
    if STATE_FILE.exists():
        try:
            loaded = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                state.update(loaded)
        except (OSError, json.JSONDecodeError):
            pass

    state.setdefault("land_change", {})
    state["land_change"][village] = round(float(land_change_score), 6)
    state["latest"] = {
        "village": village,
        "job_id": job_id,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "result": payload,
    }
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _normalise_change_result(results: dict) -> dict:
    # /api/detect-change uses the core engine as the canonical source of truth.
    # If a caller later asks for both engines, prefer advanced only when present.
    adv = results.get("advanced")
    core = results.get("core")

    selected = adv or core
    if not selected:
        raise ValueError("No OpenCV result was produced")

    if adv:
        change = adv.get("change", {})
        return {
            "engine": "advanced",
            "change_percentage": float(change.get("detected_change_percentage", 0)),
            "confidence": float(change.get("confidence_score", 0)),
            "significant_regions": int(change.get("significant_region_count", 0)),
            "alignment_confidence": float(adv.get("alignment", {}).get("alignment_confidence", 0)),
            "hazard": adv.get("assessment", {}),
            "files": adv.get("files", {}),
        }

    change = core.get("change", {})
    return {
        "engine": "core",
        "change_percentage": float(change.get("changed_area_pct", 0)),
        "confidence": float(core.get("evidence_confidence", {}).get("score", 0)),
        "significant_regions": int(change.get("significant_regions", 0)),
        "alignment_confidence": float(core.get("alignment", {}).get("alignment_confidence", 0)),
        "hazard": core.get("assessment", {}),
        "files": core.get("files", {}),
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "vasunetra", "version": "1.0.0"}


@app.get("/api/villages")
def get_villages():
    return _clean_rows(load_and_score())


@app.get("/api/worklist")
def get_worklist():
    df = load_and_score()
    top = df[["village", "hazard_score", "relocation_score", "recommended_action", "high_population_flag"]]
    return _clean_rows(top)


@app.get("/api/villages/{name}")
def get_village_detail(name: str):
    df = load_and_score()
    row = df[df["village"].astype(str) == name]
    if row.empty:
        raise HTTPException(status_code=404, detail="village not found")
    return _clean_rows(row)[0]


@app.post("/api/detect-change")
async def detect_change_endpoint( before: UploadFile = File(...), after: UploadFile = File(...), village: str | None = Form(None), ):
    """Canonical Field Analysis endpoint: two images -> core OpenCV -> score update."""
    payload = await analyze_images(before=before, after=after, engine="core", village=village)
    normalized = payload["normalized"]
    return {
        "job_id": payload["core"]["job_id"],
        "village": village,
        "engine": "core",
        "change_percentage": normalized["change_percentage"],
        "confidence": normalized["confidence"],
        "alignment_confidence": normalized["alignment_confidence"],
        "significant_regions": normalized["significant_regions"],
        "hazard": normalized["hazard"],
        "files": normalized["files"],
        "land_change_score": payload["land_change_score"],
        "updated_village_data": payload.get("updated_village_data"),
    }


@app.get("/api/jobs/{job_id}/artifact/{engine}/{filename}")
def get_artifact(job_id: str, engine: str, filename: str):
    """Serve generated analysis images/files through the same FastAPI origin as the Field page."""
    engine = engine.lower().strip()
    if engine not in ARTIFACTS or filename not in ARTIFACTS[engine]:
        raise HTTPException(status_code=404, detail="artifact not found")
    path = MEDIA_ROOT / job_id / engine / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="artifact not found")
    return FileResponse(path)


@app.get("/api/jobs/{job_id}/report")
def download_report(job_id: str):
    report = MEDIA_ROOT / job_id / "advanced" / "final_assessment.json"
    if not report.exists():
        report = MEDIA_ROOT / job_id / "core" / "result.json"
    if not report.exists():
        raise HTTPException(status_code=404, detail="analysis report not found")
    return FileResponse(
        report,
        media_type="application/json",
        filename=f"vasunetra-analysis-{job_id}.json",
    )


@app.post("/api/analyze")
async def analyze_images( before: UploadFile = File(...), after: UploadFile = File(...), engine: str = "core", village: str | None = Form(None), ):
    engine = engine.lower().strip()
    if engine not in {"core", "advanced", "both"}:
        raise HTTPException(status_code=400, detail="engine must be core, advanced or both")

    job_id = uuid.uuid4().hex
    job_dir = MEDIA_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    before_suffix = Path(before.filename or "").suffix.lower() or ".jpg"
    after_suffix = Path(after.filename or "").suffix.lower() or ".jpg"
    allowed = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
    if before_suffix not in allowed or after_suffix not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported image format. Use JPG, PNG, WEBP, BMP or TIFF.")

    before_path = job_dir / f"before{before_suffix}"
    after_path = job_dir / f"after{after_suffix}"

    with before_path.open("wb") as f:
        shutil.copyfileobj(before.file, f)
    with after_path.open("wb") as f:
        shutil.copyfileobj(after.file, f)

    try:
        results = {}
        if engine in {"core", "both"}:
            results["core"] = run_core_pipeline(before_path, after_path, job_id=job_id)
        if engine in {"advanced", "both"}:
            results["advanced"] = run_advanced_pipeline(before_path, after_path, job_id=job_id)

        normalized = _normalise_change_result(results)
        results["land_change_score"] = round(normalized["change_percentage"] / 100.0, 4)
        results["normalized"] = normalized

        if village:
            df = load_and_score()
            villages = df["village"].astype(str).tolist()
            if village not in villages:
                raise HTTPException(status_code=400, detail=f"unknown village: {village}")

            _save_analysis_state(village, results["land_change_score"], results, job_id)
            results["updated_village"] = village

            updated = load_and_score()
            rows = _clean_rows(updated)
            results["updated_village_data"] = next(
                row for row in rows if str(row["village"]) == village
            )

        return results

    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=f"Image analysis failed: {exc}") from exc


def _load_reports():
    try:
        value = json.loads(REPORTS_FILE.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save_report(item):
    reports = _load_reports()
    reports.insert(0, item)
    REPORTS_FILE.write_text(json.dumps(reports[:100], indent=2), encoding="utf-8")


@app.get("/api/summary")
def get_summary():
    df = load_and_score()
    latest = None
    if STATE_FILE.exists():
        try:
            latest = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            latest = None

    return {
        "villages": int(len(df)),
        "high_risk": int((df["hazard_score"] > 0.55).sum()),
        "needs_action": int(
            df["recommended_action"].isin(
                ["Immediate Verification", "Relocation Assessment"]
            ).sum()
        ),
        "land_change_alerts": int((df["land_change"] > 0).sum()),
        "high_capacity_pressure": int((df["capacity_pressure"] >= 0.75).sum()),
        "latest_analysis": latest,
    }


@app.get("/api/alerts")
def get_alerts():
    df = load_and_score()
    alerts = []
    for _, row in df.head(5).iterrows():
        tier = "HIGH" if row["hazard_score"] > 0.55 else ("MEDIUM" if row["hazard_score"] > 0.35 else "LOW")
        if tier != "LOW":
            alerts.append(
                {
                    "village": row["village"],
                    "severity": tier,
                    "message": f'{row["recommended_action"]} recommended. Hazard score {row["hazard_score"] * 100:.0f}/100.',
                    "land_change": round(float(row["land_change"] * 100), 2),
                }
            )
    return alerts


@app.get("/api/safe-zones/{village}")
def get_safe_zone(village: str):
    df = load_and_score()
    row = df[df["village"].astype(str) == village]
    if row.empty:
        raise HTTPException(status_code=404, detail="village not found")

    r = row.iloc[0]
    return {
        "village": village,
        "name": r.get("safe_zone", "Designated Community Safe Zone"),
        "distance_km": float(r.get("safe_zone_distance_km", 2.5)),
        "latitude": float(r.get("safe_zone_lat", r.get("latitude", 23.73))),
        "longitude": float(r.get("safe_zone_lon", r.get("longitude", 92.68))),
        "capacity": int(r.get("shelter_capacity", 300)),
        "capacity_status": r.get("capacity_status", "Prototype estimate"),
    }


@app.post("/api/citizen/report")
async def citizen_report(payload: dict):
    issue = str(payload.get("issue", "")).strip()
    village = str(payload.get("village", "Unknown")).strip()
    if not issue:
        raise HTTPException(status_code=400, detail="Issue description is required")

    report = {
        "id": uuid.uuid4().hex[:10],
        "village": village,
        "issue": issue[:500],
        "status": "Received",
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    _save_report(report)
    return report



@app.post("/api/sms/register")
async def register_sms_recipient(payload: dict):
    try:
        item = register_recipient(
            name=payload.get("name", ""),
            phone=payload.get("phone", ""),
            village=payload.get("village", ""),
        )
        return {"success": True, "recipient": {"id": item["id"], "name": item["name"], "phone": "*" * max(0, len(item["phone"]) - 4) + item["phone"][-4:], "village": item["village"], "active": item["active"]}, "message": "Citizen is now subscribed to Vasunetra SMS alerts for this habitation."}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/sms/recipients")
def get_sms_recipients(village: str | None = None):
    rows = list_recipients(village)
    return [{"id": r["id"], "name": r["name"], "phone": "*" * max(0, len(r["phone"]) - 4) + r["phone"][-4:], "village": r["village"], "active": r.get("active", True)} for r in rows]


@app.get("/api/sms/logs")
def get_sms_logs(limit: int = 20):
    return recent_logs(limit)


@app.post("/api/sms/send")
def send_sms_alert(payload: dict):
    village = str(payload.get("village", "")).strip()
    if not village:
        raise HTTPException(status_code=400, detail="Village is required")

    df = load_and_score()
    row = df[df["village"].astype(str) == village]
    if row.empty:
        raise HTTPException(status_code=404, detail="village not found")

    r = row.iloc[0]
    hazard = float(r["hazard_score"]) * 100.0
    relocation = float(r["relocation_score"]) * 100.0
    action = str(r["recommended_action"])

    if action not in {"Immediate Verification", "Relocation Assessment"} and hazard < 55 and relocation < 55:
        raise HTTPException(status_code=409, detail="SMS alert is reserved for high-priority or relocation-assessment villages.")

    safe_zone = r.get("safe_zone")
    result = send_alert(
        village=village,
        action=action,
        risk_score=max(hazard, relocation),
        safe_zone=str(safe_zone) if safe_zone and safe_zone == safe_zone else None,
    )
    return {**result, "priority": action, "hazard_score": round(hazard, 2), "relocation_score": round(relocation, 2)}

@app.get("/api/reports")
def get_reports():
    return _load_reports()[:30]


@app.get("/")
def root():
    # Keep the Vasunetra role-selection landing page as the application home page.
    return FileResponse(FRONTEND / "landing.html")
