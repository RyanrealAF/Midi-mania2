from fastapi import FastAPI, UploadFile, WebSocket, HTTPException, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from pathlib import Path
import uuid
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import shutil
import logging

from pipeline import DrumPipeline, ProcessingStage

# Models
class UploadResponse(BaseModel):
    task_id: str
    status: str

class TaskStatus(BaseModel):
    task_id: str
    status: str
    progress: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, str]] = None
    error: Optional[str] = None

# Config
BASE_DIR = Path("/data/drumextract") if Path("/data").exists() else Path("/tmp/drumextract")
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
for d in [UPLOAD_DIR, OUTPUT_DIR]: d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="DrumExtract API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# State
task_registry: Dict[str, Dict[str, Any]] = {}
pipeline = DrumPipeline(OUTPUT_DIR)

async def cleanup_loop():
    while True:
        await asyncio.sleep(3600)
        cutoff = datetime.now() - timedelta(hours=1)
        for t_id, task in list(task_registry.items()):
            if task.get("created_at", datetime.now()) < cutoff:
                # Cleanup files
                shutil.rmtree(UPLOAD_DIR / t_id, ignore_errors=True)
                for f in OUTPUT_DIR.glob(f"{t_id}*"):
                    if f.is_file(): f.unlink()
                    else: shutil.rmtree(f, ignore_errors=True)
                task_registry.pop(t_id, None)

@app.on_event("startup")
async def startup(): asyncio.create_task(cleanup_loop())

@app.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile):
    task_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix.lower()
    path = UPLOAD_DIR / f"{task_id}{ext}"
    content = await file.read()
    with open(path, "wb") as f: f.write(content)
    task_registry[task_id] = {
        "id": task_id, "status": "pending", "path": str(path),
        "filename": file.filename, "created_at": datetime.now(),
        "progress": {"stage": "idle", "percent": 0, "message": "Ready"},
        "event": asyncio.Event() # For signaling state changes to WS
    }
    return {"task_id": task_id, "status": "success"}

async def run_separation(task_id: str):
    task = task_registry[task_id]
    task["status"] = "processing"
    try:
        async for p in pipeline.separate(task_id, task["path"]):
            task["progress"] = p
            task["event"].set()
            task["event"].clear()
        task["status"] = "awaiting_midi"
        task["event"].set()
        task["event"].clear()
    except Exception as e:
        task["status"] = "failed"; task["error"] = str(e)
        task["event"].set()

async def run_midi(task_id: str, onset: float, frame: float):
    task = task_registry[task_id]
    task["status"] = "processing"
    try:
        drum_path = OUTPUT_DIR / f"{task_id}_drums.wav"
        async for p in pipeline.convert_to_midi(task_id, drum_path, onset, frame):
            task["progress"] = p
            task["event"].set()
            task["event"].clear()
        task["status"] = "complete"
        task["event"].set()
    except Exception as e:
        task["status"] = "failed"; task["error"] = str(e)
        task["event"].set()

@app.websocket("/ws/process/{task_id}")
async def ws_process(websocket: WebSocket, task_id: str):
    await websocket.accept()
    if task_id not in task_registry:
        await websocket.send_json({"error": "Unknown task"}); await websocket.close(); return

    task = task_registry[task_id]

    # Start separation if pending
    if task["status"] == "pending":
        asyncio.create_task(run_separation(task_id))

    try:
        while True:
            # Send current state
            resp = {
                "status": task["status"],
                "progress": task["progress"],
                "task_id": task_id
            }
            if task["status"] == "awaiting_midi":
                resp["drum_url"] = f"/preview/{task_id}"
            if task["status"] == "complete":
                resp["complete"] = True
                resp["midi_url"] = f"/download/midi/{task_id}"
                resp["drum_url"] = f"/download/drums/{task_id}"
            if task["status"] == "failed":
                resp["error"] = task.get("error")

            await websocket.send_json(resp)
            if task["status"] in ["complete", "failed"]: break

            # Wait for next update or client command
            done, pending = await asyncio.wait(
                [asyncio.create_task(task["event"].wait()), asyncio.create_task(websocket.receive_json())],
                return_when=asyncio.FIRST_COMPLETED
            )

            for d in done:
                res = d.result()
                if isinstance(res, dict) and res.get("command") == "start_midi":
                    asyncio.create_task(run_midi(task_id, res.get("onset", 0.5), res.get("frame", 0.3)))
                elif isinstance(res, dict) and res.get("command") == "cancel":
                    task["status"] = "cancelled"; break

            if task["status"] == "cancelled": break

    except WebSocketDisconnect: pass
    finally: try: await websocket.close()
    except: pass

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in task_registry: raise HTTPException(404)
    t = task_registry[task_id]
    return {
        "status": t["status"], "progress": t["progress"],
        "midi_url": f"/download/midi/{task_id}" if t["status"] == "complete" else None,
        "drum_url": f"/download/drums/{task_id}" if t["status"] in ["awaiting_midi", "complete"] else None,
        "error": t.get("error")
    }

@app.get("/preview/{task_id}")
@app.get("/download/drums/{task_id}")
async def get_drums(task_id: str):
    path = OUTPUT_DIR / f"{task_id}_drums.wav"
    if not path.exists(): raise HTTPException(404)
    return FileResponse(path, media_type="audio/wav")

@app.get("/download/midi/{task_id}")
async def get_midi(task_id: str):
    path = OUTPUT_DIR / f"{task_id}_drums.mid"
    if not path.exists(): raise HTTPException(404)
    return FileResponse(path, media_type="audio/midi")

@app.get("/download/stems/{task_id}/{stem}")
async def get_other_stem(task_id: str, stem: str):
    path = OUTPUT_DIR / f"{task_id}_stems" / f"{stem}.wav"
    if not path.exists(): raise HTTPException(404)
    return FileResponse(path, media_type="audio/wav")

@app.get("/health")
async def health(): return {"status": "ok"}

@app.delete("/task/{task_id}")
async def delete_task(task_id: str):
    if task_id in task_registry: task_registry.pop(task_id); return {"status": "deleted"}
    raise HTTPException(404)
