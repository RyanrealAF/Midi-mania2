import modal

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install_from_requirements("requirements.txt")
    .run_commands(
        "python -c \"from spleeter.separator import Separator; Separator('spleeter:4stems')\""
    )
)

app = modal.App("drumextract-api")
volume = modal.Volume.from_name("drumextract-data", create_if_missing=True)

@app.function(
    image=image,
    gpu="T4",
    memory=8192,
    timeout=600,
    volumes={"/data": volume},
    allow_concurrent_inputs=10,
    keep_warm=1
)
@modal.asgi_app()
def fastapi_app():
    from main import app
    return app

@app.function(schedule=modal.Cron("*/5 8-22 * * *"))
def keep_warm():
    import requests
    try: requests.get("https://api.buildwhilebleeding.com/health")
    except: pass
