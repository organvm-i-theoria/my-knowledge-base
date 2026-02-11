# Deployment Guide

This guide covers deploying the Knowledge Base system in production environments.

## Prerequisites

- Node.js 20+ (LTS recommended)
- `.env` file with required API keys
- Sufficient disk space for database and embeddings (~1GB minimum)

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...          # OpenAI API key for embeddings
ANTHROPIC_API_KEY=sk-ant-...   # Anthropic API key for Phase 3 intelligence

# Server Configuration
PORT=3000                       # HTTP port (default: 3000)
NODE_ENV=production             # Environment mode
DATABASE_PATH=./db/knowledge.db # SQLite database location

# Security
CORS_ORIGINS=https://app.example.com,https://admin.example.com
CORS_METHODS=GET,POST,PUT,DELETE
ENFORCE_HTTPS=true              # Redirect HTTP to HTTPS (behind proxy)
ENABLE_AUTH=true                # Enable authentication middleware

# Audit & Logging
AUDIT_LOG_ENABLED=true          # Enable audit logging for write operations
AUDIT_LOG_PATH=./logs/audit.log # Audit log file location
LOG_LEVEL=info                  # Log verbosity: debug, info, warn, error

# Backup & Encryption
BACKUP_ENCRYPTION_KEY=<32-byte-base64-or-hex>  # Encrypted backup key

# ChromaDB (optional, for external vector DB)
CHROMA_URL=http://localhost:8000
CHROMA_HOST=localhost
CHROMA_PORT=8000

# Search runtime policy (recommended in production)
KB_SEARCH_SEMANTIC_POLICY=strict  # strict | degrade
KB_SEARCH_HYBRID_POLICY=strict    # strict | degrade

# Embeddings runtime selection
KB_EMBEDDINGS_PROVIDER=openai     # openai | local | mock

# Runtime probe targets (manual/local execution mode)
STAGING_BASE_URL=https://staging.example.com
PROD_BASE_URL=https://app.example.com
STAGING_AUTH_HEADER=Authorization: Bearer <token>  # optional
PROD_AUTH_HEADER=Authorization: Bearer <token>     # optional

# 1Password secret references (GitHub release workflow mode)
# Store these as GitHub repository variables:
# OP_STAGING_BASE_URL_REF=op://kb-release-runtime/kb-staging-runtime-probe/base_url
# OP_PROD_BASE_URL_REF=op://kb-release-runtime/kb-prod-runtime-probe/base_url
# OP_STAGING_AUTH_HEADER_REF=op://kb-release-runtime/kb-staging-runtime-probe/auth_header
# OP_PROD_AUTH_HEADER_REF=op://kb-release-runtime/kb-prod-runtime-probe/auth_header
# REINDEX_EVIDENCE_REF=docs/evidence/reindex-runs/prod-<timestamp>.json
#
# Store this as a GitHub repository secret:
# OP_SERVICE_ACCOUNT_TOKEN=<1password-service-account-token>
```

---

## Local Build & Run

```bash
# Install dependencies
npm ci --production

# Build TypeScript
npm run build

# Run database migrations
npm run migrate

# Start production server
NODE_ENV=production npm run start

# Verify
curl http://localhost:3000/api/health

# Verify semantic/hybrid runtime readiness
npm run readiness:semantic

# Verify strict production readiness (fails on profile mismatch/fallback)
npm run readiness:semantic:strict
```

### CI/Release Readiness Gate

- Release workflow now blocks image publish/promotion when strict readiness fails.
- Gate prerequisites in CI:
  - Chroma service reachable (`CHROMA_URL`).
  - Reindex step completed for probe dataset.
  - `npm run readiness:semantic:strict` exits `0`.
- If this gate fails, do not promote; remediate vector/profile/runtime dependency issues first.

### Runtime Probe Promotion Gate

- Promotion must include parity + strict runtime probes against staging and prod.
- Release workflow resolves probe configuration from 1Password at runtime and fails hard when probe gates fail.
- GitHub workflow prerequisites:
  - Repository secret: `OP_SERVICE_ACCOUNT_TOKEN` (allow-secret: secret name only)
  - Repository variables:
    - `OP_STAGING_BASE_URL_REF`
    - `OP_PROD_BASE_URL_REF`
    - `OP_STAGING_AUTH_HEADER_REF` (optional)
    - `OP_PROD_AUTH_HEADER_REF` (optional)
    - `REINDEX_EVIDENCE_REF` (required, must reference concrete unbounded reindex evidence)
- 1Password item reference format:
  - `op://<vault>/<item>/<field>`
  - Example: `op://kb-release-runtime/kb-staging-runtime-probe/base_url`
- Run:
  - `npm run probe:staging -- --out docs/evidence/runtime-probes/staging-<timestamp>.json`
  - `npm run probe:prod -- --out docs/evidence/runtime-probes/prod-<timestamp>.json`
  - `npm run reindex:evidence:prod -- --out docs/evidence/reindex-runs/prod-<timestamp>.json`
  - `npm run reindex:evidence:verify -- --ref docs/evidence/reindex-runs/prod-<timestamp>.json --require-unbounded true`
- Promotion is blocked if either report has `pass=false`.
- Specifically block on:
  - any strict semantic/hybrid `503` spike
  - `/api/search` vs `/api/search/fts` parity mismatch
  - strict policy drift (`searchPolicyApplied`)
  - missing `vectorProfileId` telemetry on strict responses

### Embedding Profile Promotion Workflow

Use profile-aware reindex and pointer switch workflows to keep semantic/hybrid search consistent:

```bash
# 1) Verify current profile and active pointer state
npm run generate-embeddings -- --mode verify

# 2) Reindex vectors for the current configured profile and switch pointer
npm run generate-embeddings -- --mode reindex --yes

# 3) Validate strict readiness before deploy
npm run readiness:semantic:strict
```

Switching to an existing profile without reindex:

```bash
npm run generate-embeddings -- --mode switch --profile-id <profile_id> --yes
```

---

## Docker Deployment

### Build Image

```bash
# Build production image
docker build -t knowledge-base:latest .

# Verify image size (~200MB)
docker images knowledge-base
```

### Run Container

```bash
# Create data directories
mkdir -p ./db ./atomized ./exports

# Run with environment variables
docker run -d \
  --name knowledge-base \
  -p 3000:3000 \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  -e DATABASE_PATH=/app/db/knowledge.db \
  -v $(pwd)/db:/app/db \
  -v $(pwd)/atomized:/app/atomized \
  -v $(pwd)/exports:/app/exports \
  --restart unless-stopped \
  knowledge-base:latest

# Verify container health
docker logs -f knowledge-base
docker exec knowledge-base curl -s http://localhost:3000/api/health
```

### Docker Compose

```bash
# Start with default profile (app only)
docker-compose up -d

# Start with ChromaDB for external vector storage
docker-compose --profile with-chroma up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

**docker-compose.yml configuration:**
- `knowledge-base`: Main application on port 3000
- `chroma`: Optional ChromaDB on port 8000 (profile: `with-chroma`)
- Volumes: `db/`, `atomized/`, `exports/`
- Health check: 30s interval, 10s timeout, 3 retries

---

## GitHub Pages Frontend (Static) + API Backend (Docker/Server)

Use GitHub Pages for the React UI only. Keep this API running on a separate backend host.

- Setup guide: `docs/GITHUB_PAGES_SETUP.md`
- Workflow: `.github/workflows/pages.yml`

Required repository variables for Pages deployment:
- `PAGES_API_BASE_URL` (for example `https://api.example.com/api`)
- `PAGES_BASE_PATH` (optional, defaults to `/<repo-name>/`)
- `PAGES_CUSTOM_DOMAIN` (optional)

## Kubernetes Deployment

### Prerequisites

```bash
# Create namespace
kubectl create namespace knowledge-base

# Create secrets for API keys
kubectl create secret generic kb-secrets \
  --namespace=knowledge-base \
  --from-literal=OPENAI_API_KEY="${OPENAI_API_KEY}" \
  --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
```

### Example Manifests

**deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: knowledge-base
  namespace: knowledge-base
spec:
  replicas: 2
  selector:
    matchLabels:
      app: knowledge-base
  template:
    metadata:
      labels:
        app: knowledge-base
    spec:
      containers:
      - name: app
        image: knowledge-base:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_PATH
          value: "/app/db/knowledge.db"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: kb-secrets
              key: OPENAI_API_KEY
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: kb-secrets
              key: ANTHROPIC_API_KEY
        volumeMounts:
        - name: db-storage
          mountPath: /app/db
        - name: atomized-storage
          mountPath: /app/atomized
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 40
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
      volumes:
      - name: db-storage
        persistentVolumeClaim:
          claimName: kb-db-pvc
      - name: atomized-storage
        persistentVolumeClaim:
          claimName: kb-atomized-pvc
```

**service.yaml:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: knowledge-base
  namespace: knowledge-base
spec:
  selector:
    app: knowledge-base
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

**ingress.yaml (with TLS):**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: knowledge-base
  namespace: knowledge-base
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - kb.example.com
    secretName: kb-tls
  rules:
  - host: kb.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: knowledge-base
            port:
              number: 80
```

### Deploy

```bash
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Verify
kubectl get pods -n knowledge-base
kubectl logs -f deployment/knowledge-base -n knowledge-base
```

---

## Cloud Deployments

### AWS ECS (Fargate)

**Task Definition (excerpt):**
```json
{
  "family": "knowledge-base",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [{
    "name": "app",
    "image": "your-ecr-repo/knowledge-base:latest",
    "portMappings": [{"containerPort": 3000}],
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "DATABASE_PATH", "value": "/app/db/knowledge.db"}
    ],
    "secrets": [
      {"name": "OPENAI_API_KEY", "valueFrom": "arn:aws:ssm:..."},
      {"name": "ANTHROPIC_API_KEY", "valueFrom": "arn:aws:ssm:..."}
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"],
      "interval": 30,
      "timeout": 10,
      "retries": 3
    },
    "mountPoints": [{
      "sourceVolume": "db-volume",
      "containerPath": "/app/db"
    }]
  }]
}
```

**Deploy with EFS for persistent storage:**
```bash
# Create EFS file system
aws efs create-file-system --creation-token kb-efs

# Create service with load balancer
aws ecs create-service \
  --cluster production \
  --service-name knowledge-base \
  --task-definition knowledge-base:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --load-balancers targetGroupArn=arn:aws:... \
  --network-configuration "awsvpcConfiguration={subnets=[...],securityGroups=[...]}"
```

### GCP Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/knowledge-base

# Deploy
gcloud run deploy knowledge-base \
  --image gcr.io/PROJECT_ID/knowledge-base \
  --platform managed \
  --region us-central1 \
  --port 3000 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --set-secrets OPENAI_API_KEY=openai-key:latest,ANTHROPIC_API_KEY=anthropic-key:latest \
  --set-env-vars NODE_ENV=production

# Verify
gcloud run services describe knowledge-base --region us-central1
```

**Note:** Cloud Run is stateless; use Cloud SQL or external storage for persistence.

---

## SSL/TLS Configuration

### Behind Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name kb.example.com;

    ssl_certificate /etc/letsencrypt/live/kb.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kb.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name kb.example.com;
    return 301 https://$server_name$request_uri;
}
```

### Application HTTPS Redirect

Set `ENFORCE_HTTPS=true` to redirect HTTP requests to HTTPS when behind a proxy that sets `X-Forwarded-Proto`.

---

## Database Migration on Deploy

### Manual Migration

```bash
# Run migrations before starting
npm run migrate

# Or with explicit database path
DATABASE_PATH=/app/db/knowledge.db npm run migrate
```

### Docker Migration

```bash
# Run migration in container before starting
docker run --rm \
  -v $(pwd)/db:/app/db \
  knowledge-base:latest \
  node dist/migrations.js

# Then start the service
docker-compose up -d
```

### Kubernetes Migration Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: kb-migrate
  namespace: knowledge-base
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: knowledge-base:latest
        command: ["node", "dist/migrations.js"]
        volumeMounts:
        - name: db-storage
          mountPath: /app/db
      restartPolicy: Never
      volumes:
      - name: db-storage
        persistentVolumeClaim:
          claimName: kb-db-pvc
  backoffLimit: 3
```

---

## Health Check Configuration

The `/api/health` endpoint returns:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Health Check Intervals

| Environment | Interval | Timeout | Retries | Start Period |
|-------------|----------|---------|---------|--------------|
| Docker      | 30s      | 10s     | 3       | 40s          |
| Kubernetes  | 30s      | 10s     | 3       | 40s          |
| ECS/Fargate | 30s      | 10s     | 3       | 60s          |

---

## Scaling Considerations

### Horizontal Scaling

- **SQLite limitation**: Only one writer at a time (WAL mode helps readers)
- **For multi-instance**: Use PostgreSQL or MySQL instead of SQLite
- **ChromaDB**: Deploy as separate service, multiple app instances can share

### Vertical Scaling Recommendations

| Load Level | Memory | CPU  | Notes |
|------------|--------|------|-------|
| Light      | 512MB  | 0.5  | <1000 units |
| Medium     | 1GB    | 1.0  | 1k-10k units |
| Heavy      | 2GB    | 2.0  | 10k-100k units |
| Production | 4GB+   | 4.0  | 100k+ units, Phase 3 |

### Performance Tuning

```bash
# Increase Node.js heap for large datasets
NODE_OPTIONS="--max-old-space-size=4096" npm run start

# SQLite optimization (in database.ts)
# WAL mode is enabled by default
# Consider PRAGMA synchronous = NORMAL for better write perf
```

---

## Backup Strategy

### Automated Backups

```bash
# Backup SQLite database
cp db/knowledge.db backups/knowledge-$(date +%Y%m%d).db

# Backup ChromaDB embeddings
tar -czf backups/chroma-$(date +%Y%m%d).tar.gz atomized/embeddings/chroma

# With encryption (requires BACKUP_ENCRYPTION_KEY)
npm run backup -- --encrypt
```

### Restore

```bash
# Restore database
cp backups/knowledge-20260127.db db/knowledge.db

# Restore embeddings
tar -xzf backups/chroma-20260127.tar.gz -C atomized/embeddings/
```

---

## Security Checklist

- [ ] API keys stored in secrets manager, not environment variables
- [ ] HTTPS enforced (`ENFORCE_HTTPS=true`)
- [ ] CORS configured for specific origins
- [ ] Authentication enabled (`ENABLE_AUTH=true`)
- [ ] Audit logging enabled for compliance
- [ ] Database file permissions restricted (600)
- [ ] Container runs as non-root user
- [ ] Network policies restrict ingress/egress
- [ ] Backup encryption enabled

---

## Monitoring

### Key Metrics

- `GET /api/health` - Uptime and status
- `GET /api/stats` - Unit counts, database size
- `GET /api/rate-limit/usage` - API usage statistics
- `GET /api/search/analytics` - Search performance

### Log Aggregation

```bash
# JSON logging for structured log aggregation
LOG_FORMAT=json npm run start

# Example log output
{"level":"info","timestamp":"2026-01-27T10:30:00Z","msg":"Request completed","method":"GET","path":"/api/search","status":200,"latency":45}
```

---

## References

- `Dockerfile` - Multi-stage production build
- `docker-compose.yml` - Local development and production compose
- `docs/OPERATIONS.md` - Day-to-day operations guide
- `docs/TROUBLESHOOTING.md` - Common issues and fixes
