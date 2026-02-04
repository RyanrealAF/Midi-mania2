"""
DrumExtract Backend - FastAPI Application
Handles audio upload, Spleeter separation, Basic-Pitch MIDI conversion
with real-time WebSocket progress streaming.
"""

from fastapi import FastAPI, UploadFile, WebSocket, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
import uuid
import asyncio
import json
from typing import Optional, AsyncGenerator
from datetime import datetime, timedelta
import shutil

from pipeline import DrumPipeline, ProcessingStage

# Models
class UploadResponse(BaseModel):
    task_id: str
    status: str
    message: str

class ProgressUpdate(BaseModel):
    task_id: str
    stage: str
    percent: float
    message: str
    timestamp: str

class ErrorResponse(BaseModel):
    error: str
    details: Optional[str] = None

class TaskStatus(BaseModel):
    task_id: str
    status: str  # "pending" | "processing" | "complete" | "failed"
    progress: Optional[ProgressUpdate] = None
    midi_url: Optional[str] = None
    drum_url: Optional[str] = None
    error: Optional[str] = None

# Configuration
UPLOAD_DIR = Path("/tmp/drumextract/uploads")
OUTPUT_DIR = Path("/tmp/drumextract/outputs")
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Application
app = FastAPI(title="DrumExtract API", version="2.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://studio.buildwhilebleeding.com",
        "https://buildwhilebleeding.com",
        "http://localhost:3000",  # Development
        "http://localhost:5173",  # Vite
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Task Registry (In production, use Redis)
task_registry = {}

# Pipeline Instance
pipeline = DrumPipeline(output_dir=OUTPUT_DIR)

# Cleanup Task
async def cleanup_old_files():
    """Remove files older than 1 hour"""
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        cutoff = datetime.now() - timedelta(hours=1)
        
        for directory in [UPLOAD_DIR, OUTPUT_DIR]:
            for item in directory.iterdir():
                if item.is_file():
                    mtime = datetime.fromtimestamp(item.stat().st_mtime)
                    if mtime < cutoff:
                        item.unlink()
                elif item.is_dir():
                    try:
                        shutil.rmtree(item)
                    except Exception:
                        pass

@app.on_event("startup")
async def startup_event():
    """Start background cleanup task"""
    asyncio.create_task(cleanup_old_files())

# Endpoints
@app.post("/upload", response_model=UploadResponse)
async def upload_audio(file: UploadFile):
    """
    Upload audio file for processing.
    Returns task_id for WebSocket connection.
    """
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Generate task ID
    task_id = str(uuid.uuid4())
    
    # Save uploaded file
    upload_path = UPLOAD_DIR / f"{task_id}{file_ext}"
    
    try:
        content = await file.read()
        
        # Validate file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Max size: {MAX_FILE_SIZE / (1024*1024)}MB"
            )
        
        with open(upload_path, "wb") as f:
            f.write(content)
        
        # Register task
        task_registry[task_id] = {
            "status": "pending",
            "upload_path": str(upload_path),
            "filename": file.filename,
            "created_at": datetime.now()
        }
        
        return UploadResponse(
            task_id=task_id,
            status="success",
            message=f"File uploaded successfully. Connect to /ws/process/{task_id}"
        )
    
    except Exception as e:
        if upload_path.exists():
            upload_path.unlink()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.websocket("/ws/process/{task_id}")
async def process_audio(websocket: WebSocket, task_id: str):
    """
    WebSocket endpoint for real-time processing updates.
    Streams progress through separation and MIDI conversion.
    """
    await websocket.accept()
    
    # Validate task
    if task_id not in task_registry:
        await websocket.send_json({
            "error": "Invalid task ID",
            "task_id": task_id
        })
        await websocket.close()
        return
    
    task = task_registry[task_id]
    
    if task["status"] == "processing":
        await websocket.send_json({
            "error": "Task already processing",
            "task_id": task_id
        })
        await websocket.close()
        return
    
    # Update status
    task["status"] = "processing"
    upload_path = task["upload_path"]
    
    try:
        # Process through pipeline with progress streaming
        async for progress in pipeline.process(task_id, upload_path):
            # Send progress update
            update = ProgressUpdate(
                task_id=task_id,
                stage=progress["stage"],
                percent=progress["percent"],
                message=progress["message"],
                timestamp=datetime.now().isoformat()
            )
            
            await websocket.send_json(update.dict())
            
            # Store latest progress
            task["progress"] = update.dict()
        
        # Processing complete
        task["status"] = "complete"
        task["midi_path"] = str(OUTPUT_DIR / f"{task_id}_drums.mid")
        task["drum_path"] = str(OUTPUT_DIR / f"{task_id}_drums.wav")
        
        await websocket.send_json({
            "complete": True,
            "task_id": task_id,
            "midi_url": f"/download/midi/{task_id}",
            "drum_url": f"/download/drum/{task_id}",
            "timestamp": datetime.now().isoformat()
        })
    
    except Exception as e:
        task["status"] = "failed"
        task["error"] = str(e)
        
        await websocket.send_json({
            "error": "Processing failed",
            "details": str(e),
            "task_id": task_id,
            "timestamp": datetime.now().isoformat()
        })
    
    finally:
        await websocket.close()

@app.get("/status/{task_id}", response_model=TaskStatus)
async def get_status(task_id: str):
    """
    Check processing status without WebSocket.
    Useful for reconnection or polling.
    """
    if task_id not in task_registry:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = task_registry[task_id]
    
    return TaskStatus(
        task_id=task_id,
        status=task["status"],
        progress=task.get("progress"),
        midi_url=f"/download/midi/{task_id}" if task["status"] == "complete" else None,
        drum_url=f"/download/drum/{task_id}" if task["status"] == "complete" else None,
        error=task.get("error")
    )

@app.get("/download/midi/{task_id}")
async def download_midi(task_id: str):
    """Download generated MIDI file"""
    if task_id not in task_registry:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = task_registry[task_id]
    
    if task["status"] != "complete":
        raise HTTPException(status_code=400, detail="Processing not complete")
    
    midi_path = Path(task["midi_path"])
    
    if not midi_path.exists():
        raise HTTPException(status_code=404, detail="MIDI file not found")
    
    return FileResponse(
        path=midi_path,
        media_type="audio/midi",
        filename=f"{task['filename']}_drums.mid"
    )

@app.get("/download/drum/{task_id}")
async def download_drum_audio(task_id: str):
    """Download isolated drum audio"""
    if task_id not in task_registry:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = task_registry[task_id]
    
    if task["status"] != "complete":
        raise HTTPException(status_code=400, detail="Processing not complete")
    
    drum_path = Path(task["drum_path"])
    
    if not drum_path.exists():
        raise HTTPException(status_code=404, detail="Drum audio not found")
    
    return FileResponse(
        path=drum_path,
        media_type="audio/wav",
        filename=f"{task['filename']}_drums.wav"
    )

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_tasks": len([t for t in task_registry.values() if t["status"] == "processing"])
    }

@app.delete("/task/{task_id}")
async def cancel_task(task_id: str):
    """Cancel and cleanup task"""
    if task_id in task_registry:
        task = task_registry[task_id]
        
        # Cleanup files
        for key in ["upload_path", "midi_path", "drum_path"]:
            if key in task:
                path = Path(task[key])
                if path.exists():
                    path.unlink()
        
        # Remove from registry
        del task_registry[task_id]
        
        return {"status": "deleted", "task_id": task_id}
    
    raise HTTPException(status_code=404, detail="Task not found")
