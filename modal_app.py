"""
Modal Deployment Configuration
Deploys FastAPI backend as serverless function with GPU acceleration
and pre-downloaded Spleeter models to eliminate cold-start delays.
"""

import modal

# Define container image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")  # Required by Spleeter
    .pip_install(
        "fastapi[all]==0.104.1",
        "uvicorn==0.24.0",
        "spleeter==2.4.0",
        "basic-pitch==0.2.5",
        "tensorflow==2.13.0",  # Pinned for Spleeter compatibility
        "pydantic==2.5.0",
        "python-multipart==0.0.6"
    )
    # Pre-download Spleeter models to avoid first-run delays
    .run_commands(
        "python -c \"from spleeter.separator import Separator; Separator('spleeter:4stems')\""
    )
)

# Create Modal app
app = modal.App("drumextract-api")

# Define volume for temporary file storage
volume = modal.Volume.from_name("drumextract-data", create_if_missing=True)

# Mount points
VOLUME_PATH = "/data"

@app.function(
    image=image,
    gpu="T4",  # Free tier GPU
    memory=8192,  # 8GB RAM
    timeout=600,  # 10 minute timeout
    volumes={VOLUME_PATH: volume},
    allow_concurrent_inputs=10,  # Handle 10 simultaneous requests
    keep_warm=1  # Keep one container warm during active hours
)
@modal.asgi_app()
def fastapi_app():
    """
    ASGI app wrapper for FastAPI application.
    Modal automatically handles routing and HTTPS.
    """
    from main import app
    return app

# Keep-alive function to prevent cold starts during peak hours
@app.function(
    schedule=modal.Cron("*/5 8-22 * * *")  # Every 5 min, 8am-10pm UTC
)
def keep_warm():
    """Ping API to maintain warm container"""
    import requests
    try:
        response = requests.get("https://drumextract-api.modal.run/health")
        print(f"Keep-warm ping: {response.status_code}")
    except Exception as e:
        print(f"Keep-warm failed: {e}")

# Local development server
@app.local_entrypoint()
def dev():
    """Run local development server"""
    import uvicorn
    from main import app as fastapi_app
    
    uvicorn.run(
        fastapi_app,
        host="0.0.0.0",
        port=8000,
        reload=True
    )
