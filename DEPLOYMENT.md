# DrumExtract Deployment Guide

## Architecture Overview

```
User → Cloudflare Pages (React Frontend)
     → Modal.com (FastAPI Backend w/ GPU)
     → Cloudflare R2 (Optional file storage)
```

## Backend Deployment (Modal)

### 1. Install Modal CLI
```bash
pip install modal
modal setup
```

### 2. Deploy Application
```bash
cd backend
modal deploy modal_app.py
```

This will output a URL like: `https://drumextract-api.modal.run`

### 3. Custom Domain Setup
```bash
modal domain create api.buildwhilebleeding.com
```

Then add CNAME in Cloudflare DNS:
- Type: `CNAME`
- Name: `api`
- Target: `drumextract-api.modal.run`
- Proxy status: `DNS only` (orange cloud OFF)

### 4. Environment Variables (if needed)
```bash
modal secret create drumextract-secrets \
  SENTRY_DSN=your_sentry_dsn \
  LOG_LEVEL=info
```

## Frontend Deployment (Cloudflare Pages)

### 1. Build Configuration
Create `.env.production`:
```env
REACT_APP_API_URL=https://api.buildwhilebleeding.com
```

Build command:
```bash
npm run build
```

### 2. Cloudflare Pages Setup
- Connect GitHub repo
- Build command: `npm run build`
- Build output directory: `build`
- Environment variables: Add `REACT_APP_API_URL`

### 3. Custom Domain
In Cloudflare Pages:
- Add custom domain: `studio.buildwhilebleeding.com`
- DNS automatically configured

## DNS Configuration (Cloudflare)

Your final DNS records should look like:

```
Type    Name     Target                          Proxy
------------------------------------------------------
CNAME   studio   drumextract.pages.dev          ON (orange)
CNAME   api      drumextract-api.modal.run      OFF (gray)
```

## Testing Deployment

### Backend Health Check
```bash
curl https://api.buildwhilebleeding.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-04T...",
  "active_tasks": 0
}
```

### End-to-End Test
```bash
# Upload file
curl -X POST https://api.buildwhilebleeding.com/upload \
  -F "file=@test_audio.wav"

# Response contains task_id
# Connect to WebSocket at:
# wss://api.buildwhilebleeding.com/ws/process/{task_id}
```

## Monitoring

### Modal Dashboard
- View logs: `modal app logs drumextract-api`
- Check usage: `modal volume list`
- Monitor GPU: Modal web dashboard

### Performance Metrics
- Cold start: ~15-20s (first request after idle)
- Warm start: <1s
- Processing time: 30-60s for 3min audio

### Cost Monitoring
Modal free tier includes:
- 30 GPU hours/month (T4)
- Unlimited CPU hours
- 100GB storage

Track usage:
```bash
modal profile list
```

## Troubleshooting

### CORS Errors
Verify in `main.py`:
```python
allow_origins=[
    "https://studio.buildwhilebleeding.com",
    "https://buildwhilebleeding.com"
]
```

### WebSocket Connection Fails
Check DNS:
- `api.buildwhilebleeding.com` should have Proxy OFF
- WebSocket requires direct connection to Modal

### Spleeter Model Download
If cold starts take >60s, models aren't cached.
Verify in `modal_app.py`:
```python
.run_commands(
    "python -c \"from spleeter.separator import Separator; Separator('spleeter:4stems')\""
)
```

### Out of Memory
Increase memory allocation in `modal_app.py`:
```python
@app.function(
    memory=16384,  # 16GB instead of 8GB
    ...
)
```

## Security Hardening

### Rate Limiting
Add to `main.py`:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/upload")
@limiter.limit("5/minute")
async def upload_audio(request: Request, file: UploadFile):
    ...
```

### File Upload Validation
Already implemented:
- Extension whitelist
- Size limit (100MB)
- MIME type validation

### API Key Authentication (optional)
For production, add API key middleware:
```python
from fastapi import Header, HTTPException

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != os.getenv("API_KEY"):
        raise HTTPException(status_code=401)
```

## Scaling Considerations

### Concurrent Processing
Current limit: 10 simultaneous requests

Increase in `modal_app.py`:
```python
@app.function(
    allow_concurrent_inputs=50,
    ...
)
```

### File Storage
For production scale, migrate to Cloudflare R2:
1. Create R2 bucket: `drumextract-files`
2. Update file paths to use R2 SDK
3. Set lifecycle rules (auto-delete after 24h)

### Database for Task Registry
Current: In-memory dictionary (resets on container restart)

Production: Redis or Cloudflare KV
```python
import redis
task_db = redis.from_url(os.getenv("REDIS_URL"))
```

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/deploy.yml`)
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: pip install modal
      - run: modal deploy backend/modal_app.py
        env:
          MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}
          MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}
  
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
```

## Rollback Procedure

### Backend
```bash
modal app list  # Find previous version
modal app stop drumextract-api
modal deploy backend/modal_app.py --version v1.0.0
```

### Frontend
Cloudflare Pages keeps deployment history:
1. Go to Pages dashboard
2. Select deployment
3. Click "Rollback to this deployment"

## Maintenance Windows

Recommended schedule:
- Sunday 2-4 AM UTC (lowest traffic)
- Announce in footer: "Maintenance 2-4 AM UTC"
- Enable maintenance mode page

## Support Resources

- Modal docs: https://modal.com/docs
- Cloudflare Pages: https://developers.cloudflare.com/pages
- Spleeter issues: https://github.com/deezer/spleeter
- Basic-Pitch: https://github.com/spotify/basic-pitch
