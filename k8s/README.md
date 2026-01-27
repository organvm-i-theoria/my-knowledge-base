# Kubernetes Deployment for Knowledge Base

This directory contains Kubernetes manifests for deploying the knowledge-base application.

## Architecture

The deployment uses a multi-container pod pattern:
- **app**: Main Node.js/TypeScript application (port 3000)
- **chromadb**: ChromaDB sidecar for vector storage (port 8000)

Both containers share persistent volumes for data persistence.

## Prerequisites

- Kubernetes cluster (1.25+)
- kubectl configured
- nginx-ingress-controller (for ingress)
- cert-manager (for TLS certificates)
- Docker image built and available

## Quick Start

```bash
# Apply all manifests to default namespace
kubectl apply -f k8s/

# Verify deployment
kubectl get pods -l app.kubernetes.io/name=knowledge-base
kubectl get svc knowledge-base
kubectl get ingress knowledge-base
```

## Deployment with Custom Namespace

```bash
# Create namespace
kubectl create namespace kb

# Apply all manifests
kubectl apply -f k8s/ -n kb

# Verify
kubectl get all -n kb
```

## Configuration

### 1. Create Secrets (Required)

Before deploying, you must create the secrets with your API keys:

```bash
# Option A: From command line
kubectl create secret generic knowledge-base-secrets \
  --from-literal=OPENAI_API_KEY=sk-your-openai-key \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-your-anthropic-key \
  --from-literal=JWT_SECRET=$(openssl rand -base64 32)

# Option B: From env file
cat > secrets.env << EOF
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
JWT_SECRET=$(openssl rand -base64 32)
EOF
kubectl create secret generic knowledge-base-secrets --from-env-file=secrets.env
rm secrets.env  # Clean up
```

### 2. Build Docker Image

```bash
# Build the image
docker build -t knowledge-base:latest .

# For remote clusters, push to registry
docker tag knowledge-base:latest your-registry/knowledge-base:latest
docker push your-registry/knowledge-base:latest

# Update deployment.yaml with your image reference
```

### 3. Configure Ingress Host

Edit `service.yaml` to set your domain:

```yaml
spec:
  tls:
    - hosts:
        - your-domain.com  # Change this
      secretName: knowledge-base-tls
  rules:
    - host: your-domain.com  # Change this
```

### 4. Configure Storage Class (Optional)

If your cluster requires a specific storage class, uncomment and edit in `pvc.yaml`:

```yaml
spec:
  storageClassName: your-storage-class
```

## Files Overview

| File | Description |
|------|-------------|
| `deployment.yaml` | Main deployment with app + chromadb containers |
| `service.yaml` | ClusterIP service + Ingress with TLS |
| `configmap.yaml` | Non-sensitive configuration |
| `secrets.yaml` | Template for API keys (DO NOT commit real values) |
| `hpa.yaml` | Horizontal Pod Autoscaler + PodDisruptionBudget |
| `pvc.yaml` | Persistent Volume Claims for SQLite and ChromaDB |

## Resource Requirements

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| app | 500m | 1000m | 512Mi | 1Gi |
| chromadb | 250m | 500m | 256Mi | 512Mi |

Total per pod: 750m-1500m CPU, 768Mi-1.5Gi memory

## Scaling

The HPA automatically scales between 2-10 replicas based on:
- CPU utilization > 70%
- Memory utilization > 80%

Manual scaling:
```bash
kubectl scale deployment knowledge-base --replicas=5
```

## Health Checks

The application exposes a health endpoint at `/api/health`:

```bash
# Port forward to test locally
kubectl port-forward svc/knowledge-base 3000:3000

# Test health endpoint
curl http://localhost:3000/api/health
```

## Troubleshooting

### Check pod status
```bash
kubectl get pods -l app.kubernetes.io/name=knowledge-base
kubectl describe pod <pod-name>
```

### View logs
```bash
# App container logs
kubectl logs -l app.kubernetes.io/name=knowledge-base -c app

# ChromaDB logs
kubectl logs -l app.kubernetes.io/name=knowledge-base -c chromadb

# Follow logs
kubectl logs -f -l app.kubernetes.io/name=knowledge-base -c app
```

### Check PVC status
```bash
kubectl get pvc
kubectl describe pvc knowledge-base-sqlite-pvc
```

### Debug connectivity
```bash
# Start a debug pod
kubectl run debug --rm -it --image=busybox -- /bin/sh

# Test service connectivity
wget -qO- http://knowledge-base:3000/api/health
```

## Production Considerations

### SQLite Limitations

SQLite has limitations in multi-replica scenarios:
- Only one writer at a time
- File-based storage doesn't work well with ReadWriteMany volumes

For production multi-replica deployments, consider:
1. Using PostgreSQL instead of SQLite
2. Using a single replica with vertical scaling
3. Implementing read replicas with SQLite replication

### Security Hardening

1. Enable authentication: Set `ENABLE_AUTH=true` in configmap
2. Use network policies to restrict traffic
3. Enable audit logging: Set `AUDIT_LOG_ENABLED=true`
4. Use external secrets management (Vault, AWS Secrets Manager, etc.)

### Monitoring

Add Prometheus annotations to scrape metrics:
```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"
```

## Cleanup

```bash
# Delete all resources
kubectl delete -f k8s/

# Delete namespace (if created)
kubectl delete namespace kb
```
