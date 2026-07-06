---
name: docker-infra
description: Docker, nginx, and S3-compatible storage conventions for Denarly — DNS-safe service names, nginx header inheritance, entrypoint consistency, dual S3 URLs, bucket policies, init ordering. Use when editing docker-compose.yml, Dockerfiles, entrypoint scripts, nginx config, or storage/S3 configuration.
---

# Docker & Infrastructure

## DNS-Safe Service Names

Docker Compose service names accessed via URLs must use DNS-safe characters (hyphens, not underscores). botocore, strict URL validators, and RFC 952/1123 reject underscores in hostnames — `ValueError: Invalid endpoint` crashes at runtime.

When the service name contains underscores, add a DNS-safe `networks` alias and use the alias in endpoint URLs:

```yaml
services:
  denarly_storage:          # Container name (underscores are fine)
    networks:
      denarly-network:
        aliases:
          - rustfs          # DNS-safe alias used in endpoint URLs
```

```
S3_ENDPOINT_URL=http://rustfs:9000
```

## nginx Header Inheritance

nginx does NOT inherit parent-context `add_header` directives into child blocks that define their own `add_header`. Security headers (CSP, HSTS, X-Frame-Options, etc.) must be repeated in each `location` block that has its own `add_header` — e.g., `location = /index.html` and the static-assets regex location. Critical for SPAs where `try_files` internally redirects to `/index.html`.

## Docker Entrypoint Consistency

`docker-compose.yml` inline `entrypoint` overrides the Dockerfile/shell script `CMD`/`ENTRYPOINT`. When modifying startup behavior, update **both** `docker-entrypoint.sh` **and** the inline entrypoint in `docker-compose.yml` — missing one causes different behavior depending on how the container is started.

## S3-Compatible Storage: Two URLs

With S3-compatible storage (RustFS, MinIO, …) in Docker Compose, use two URLs:

- `S3_ENDPOINT_URL` — internal Docker network hostname (e.g., `http://rustfs:9000`), used by boto3 for server-side API calls (uploads, bucket management)
- `S3_EXTERNAL_URL` — browser-accessible URL (e.g., `http://localhost:9000`), used for static file URLs rendered in HTML and presigned URLs

Internal Docker hostnames are unresolvable from the browser. Static files configure `custom_domain` in STORAGES OPTIONS to use the external URL. Presigned URL generation uses a separate boto3 client pointed at the external URL (safe — `generate_presigned_url` is a purely local cryptographic operation, no network call).

## Bucket Policies Over Object ACLs

Use **bucket policies** (not per-object ACLs) for S3 access control. Bucket policies are retroactive, idempotent, and more reliable across S3-compatible services. Per-object ACLs require setting ACL on every `put_object` and don't apply retroactively:

```python
policy = {
    'Version': '2012-10-17',
    'Statement': [{
        'Effect': 'Allow',
        'Principal': {'AWS': ['*']},
        'Action': ['s3:GetObject'],
        'Resource': [f'arn:aws:s3:::{bucket_name}/*'],
    }],
}
client.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(policy))
```

## Entrypoint Ordering: Init Before Upload

Bucket initialization must run **before** `collectstatic` — buckets must exist before files can be uploaded. Apply bucket policies during initialization:

```
migrate → seed_legal_documents → init_storage_buckets (creates buckets + applies policies) → collectstatic → start server
```
