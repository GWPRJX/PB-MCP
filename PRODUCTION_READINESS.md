# PB MCP — Production Readiness Analysis

> Deep analysis of best practices, security, performance, and production-readiness next steps.

---

## Executive Summary

PB MCP is a well-structured multi-tenant MCP server with solid architectural foundations: PostgreSQL RLS for tenant isolation, SHA-256 API key hashing, timing-safe JWT verification, and comprehensive audit logging. However, several areas need attention before production deployment, particularly around connection management, rate limiting, secret encryption, and observability.

**Overall Readiness: 7/10** — Strong foundation, needs hardening for production traffic.

---

## 1. Security Analysis

### 1.1 Strengths

| Area | Implementation | Assessment |
|------|---------------|-----------|
| API Key Storage | SHA-256 hashed at rest, raw key shown once | GOOD |
| JWT Implementation | Custom HS256 with `timingSafeEqual` | GOOD |
| SQL Injection | Parameterized queries via postgres.js tagged templates | GOOD |
| Tenant Isolation | PostgreSQL RLS with `FORCE ROW LEVEL SECURITY` | EXCELLENT |
| Input Validation | Zod schemas on all MCP tool parameters | GOOD |
| Admin Auth | Dual-mode: JWT Bearer + X-Admin-Secret | GOOD |
| Audit Trail | Fire-and-forget logging of all tool calls | GOOD |

### 1.2 Issues

#### P0 — ERP Credentials Stored in Plaintext

**Location:** `src/db/schema.ts:13-18`, `tenants` table columns
**Risk:** Database compromise exposes all tenant ERP credentials (passwords, secrets)
**Recommendation:** Encrypt ERP credentials at rest using AES-256-GCM with a server-side encryption key. Decrypt on read in `loadErpConfig()`.

```typescript
// Suggested pattern:
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
const ENCRYPTION_KEY = process.env.ERP_ENCRYPTION_KEY; // 32-byte key

function encrypt(plaintext: string): string { /* AES-256-GCM */ }
function decrypt(ciphertext: string): string { /* AES-256-GCM */ }
```

#### P0 — No Rate Limiting

**Location:** `src/server.ts`, `src/mcp/auth.ts`
**Risk:** Brute-force API key guessing, DDoS, resource exhaustion
**Recommendation:** Add `@fastify/rate-limit` with per-IP and per-tenant limits:

```typescript
await server.register(rateLimit, {
  max: 100,        // requests per window
  timeWindow: '1 minute',
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
});
```

#### P1 — YouTrack Token Stored in Plaintext

**Location:** `src/admin/settings-service.ts`, `server_settings` table
**Risk:** DB access exposes YouTrack API token
**Recommendation:** Encrypt before storing, decrypt on read. The dashboard already masks display (`****`), but storage is plaintext.

#### P1 — CORS Allows localhost in Production

**Location:** `src/server.ts:22-26`
**Risk:** If `NODE_ENV` is not checked, CORS allows `localhost:5173` in production
**Recommendation:** Conditionally set CORS origins based on `NODE_ENV`:

```typescript
const origins = process.env.NODE_ENV === 'production'
  ? [process.env.DASHBOARD_ORIGIN ?? '']
  : ['http://localhost:5173'];
```

#### P2 — No CSRF Protection

**Location:** Admin API endpoints
**Risk:** Low (API uses header-based auth, not cookies), but defense-in-depth
**Recommendation:** Consider `@fastify/csrf-protection` if cookie-based sessions are added later.

---

## 2. Performance Analysis

### 2.1 Issues

#### P0 — New Database Connection Per Auth Lookup

**Location:** `src/admin/tenant-service.ts:297`, `src/mcp/auth.ts:16`
**Risk:** Every MCP request creates a new `postgres()` connection for key lookup via `DATABASE_MIGRATION_URL`. At scale (100+ concurrent requests), this exhausts PostgreSQL's connection limit.
**Recommendation:** Create a persistent connection pool for auth lookups:

```typescript
// Singleton pool for auth lookups (max 5 connections)
const authPool = postgres(process.env.DATABASE_MIGRATION_URL, { max: 5, idle_timeout: 30 });
```

Use this pool in `lookupApiKeyByHash()`, `loadErpConfig()`, `listTenants()`, `queryAuditLog()`, and `testErpConnection()` instead of creating a new `postgres()` instance each time.

#### P1 — Full BP List Fetched for Contact Search

**Location:** `src/tools/crm.ts:71` (`list_contacts`), `src/tools/crm.ts:139` (`search_contacts`)
**Risk:** POSibolt's `/customermaster/allbplist` returns ALL business partners (can be 30K+). This is fetched on every call, then filtered/paginated in JavaScript.
**Impact:** High memory usage, slow response times, unnecessary load on POSibolt
**Recommendation:**
1. Cache the BP list with a short TTL (e.g., 5 minutes) per tenant
2. Add pagination parameters to the POSibolt API call if supported
3. Consider a local cache table that syncs periodically (like KB articles)

#### P1 — list_low_stock Fetches All Products

**Location:** `src/tools/inventory.ts:261`
**Risk:** Fetches up to 500 products every call, filters client-side
**Recommendation:** Same caching strategy as contacts, or request POSibolt add server-side filtering.

#### P2 — Stateless MCP Server Per Request

**Location:** `src/index.ts:39-46`
**Risk:** Creates new `McpServer` + tool registrations per request (lightweight but wasteful)
**Assessment:** Acceptable for current scale. Consider caching tool registrations per-tenant if performance becomes an issue.

### 2.2 Strengths

| Area | Assessment |
|------|-----------|
| OAuth Token Caching | In-memory cache with auto-refresh (60s before expiry) |
| Connection Pool | postgres.js pool (max 10, adequate for <50 tenants) |
| Transaction-scoped RLS | `SET LOCAL` prevents connection pool contamination |
| Fire-and-forget Audit | Non-blocking audit writes |

---

## 3. Error Handling & Resilience

### 3.1 Issues

#### P1 — No Retry Logic for POSibolt API Calls

**Location:** `src/posibolt/client.ts`
**Risk:** Transient network errors (timeouts, 503s) cause immediate tool failures
**Recommendation:** Add retry with exponential backoff for transient errors:

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries || !isTransient(err)) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Unreachable');
}
```

#### P1 — No Circuit Breaker for POSibolt

**Location:** All tool files
**Risk:** If POSibolt is down, every request times out (10s+ each), exhausting connections
**Recommendation:** Implement a circuit breaker that opens after N consecutive failures and returns fast errors for a cooldown period.

#### P2 — KB Sync Scheduler Has No Error Recovery

**Location:** `src/kb/scheduler.ts:32-44`
**Risk:** If sync fails repeatedly, `setInterval` keeps trying but there's no backoff or alerting
**Recommendation:** Add exponential backoff on consecutive failures, max retry limit, and error notification.

#### P2 — Graceful Shutdown Doesn't Drain Connections

**Location:** `src/index.ts:90-94`
**Risk:** In-flight requests may be terminated on shutdown
**Recommendation:** `server.close()` does handle this in Fastify, but verify database connections are drained too. Add `sql.end()` to the shutdown handler.

### 3.2 Strengths

- Tool handlers never throw (always return `toolError()`)
- `withAudit()` wraps errors internally
- `recordToolCall()` has try/catch with stderr logging
- Env var validation at startup (fail-fast)

---

## 4. Observability & Monitoring

### 4.1 Issues

#### P0 — No Health Check Endpoint

**Location:** Missing
**Risk:** Load balancers, container orchestrators (Docker, K8s) can't verify service health
**Recommendation:** Add `GET /health` returning database connectivity status:

```typescript
server.get('/health', async (req, reply) => {
  try {
    await sql`SELECT 1`;
    return reply.send({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch {
    return reply.status(503).send({ status: 'unhealthy' });
  }
});
```

#### P1 — No Structured Logging

**Location:** All `process.stderr.write()` calls throughout codebase
**Risk:** Logs are unstructured text, difficult to parse, search, and alert on
**Recommendation:** Use a structured logger (pino, already included with Fastify):

```typescript
import pino from 'pino';
const logger = pino({ level: 'info' }, pino.destination(2)); // fd 2 = stderr
logger.info({ tenantId, toolName, durationMs }, 'tool call completed');
```

#### P1 — No Metrics Collection

**Location:** Missing
**Risk:** No visibility into request rates, latency, error rates, tenant usage
**Recommendation:** Add Prometheus metrics via `fastify-metrics`:
- Request count/duration by endpoint
- Tool call count/duration by tool name
- Active connections gauge
- Error rate by error code

#### P2 — No External Alert Mechanism

**Location:** Missing
**Risk:** Failures go unnoticed until users report them
**Recommendation:** Integrate with PagerDuty/Slack/email for critical alerts (DB down, auth failures spike, sync failures).

---

## 5. Code Quality

### 5.1 Strengths

- TypeScript strict mode enabled
- Zod validation on all MCP tool inputs
- Clear module separation (admin, mcp, tools, db, kb, posibolt)
- Consistent error handling patterns across tools
- Comprehensive test suite (19 test files covering DB, admin, MCP, tools)
- Good inline documentation and JSDoc comments

### 5.2 Issues

#### P2 — Repeated `as unknown as postgres.Sql` Casts

**Location:** Multiple files (tenant-service.ts, tool-permissions-service.ts, audit-service.ts, sync.ts)
**Risk:** TypeScript type safety circumvented; maintenance burden
**Recommendation:** Create a typed helper that encapsulates the cast:

```typescript
export function txQuery(tx: postgres.TransactionSql): postgres.Sql {
  return tx as unknown as postgres.Sql;
}
```

#### P2 — Duplicated Audit Query Logic

**Location:** `src/admin/audit-service.ts:64-120`
**Risk:** 4 near-identical SQL queries differing only by WHERE clauses
**Recommendation:** Build the query dynamically:

```typescript
const conditions = [sql`tenant_id = ${tenantId}`];
if (opts.toolName) conditions.push(sql`tool_name = ${opts.toolName}`);
if (opts.status) conditions.push(sql`status = ${opts.status}`);
```

#### P3 — `any` Types in `withAudit` Wrapper

**Location:** `src/tools/errors.ts:67-71`
**Risk:** Type safety gap in the audit wrapper
**Assessment:** Acceptable trade-off for generic wrapper pattern. The `as T` return cast preserves the handler's type signature for MCP SDK overload resolution.

---

## 6. Scalability

### 6.1 Current Limits

| Resource | Current Config | Bottleneck At |
|----------|---------------|---------------|
| DB Pool (app) | 10 connections | ~50 concurrent requests |
| DB Pool (auth) | New pool per request | ~20 concurrent requests |
| OAuth Token Cache | In-memory Map | Lost on restart, not shared |
| KB Sync | Single setInterval | Single-instance only |
| BP List Fetch | Full list per call | 30K+ records in memory |

### 6.2 Scaling Recommendations

#### P1 — Horizontal Scaling

**Current:** Single-instance only (KB scheduler, in-memory token cache)
**Recommendation:**
1. Move token cache to Redis for shared state
2. Use distributed scheduling (e.g., `pg-boss`) for KB sync
3. Add session affinity or external state for any future stateful features

#### P2 — Database Indices

**Verify these exist** (should be created by migrations):
- `api_keys.key_hash` — UNIQUE (auth lookup)
- `audit_log(tenant_id, created_at DESC)` — query performance
- `kb_articles.youtrack_id` — UNIQUE (sync upsert)
- `tool_permissions(tenant_id, tool_name)` — UNIQUE (upsert)

#### P2 — Connection Pooling

**Recommendation:** For >50 tenants, add PgBouncer between the application and PostgreSQL. The current postgres.js pool is adequate for small deployments.

---

## 7. CI/CD & DevOps

### 7.1 Current State

- GitHub Actions CI pipeline (`ci.yml`)
- Docker + Docker Compose for dev and production
- golang-migrate for database migrations

### 7.2 Issues

#### P1 — No Automated Database Backup

**Recommendation:** Add `pg_dump` cron job or use managed PostgreSQL with automated backups.

#### P2 — No Rollback Strategy Documented

**Recommendation:** Document rollback procedures:
- Application: revert Docker image tag
- Database: `npm run migrate:down` (ensure all down migrations are tested)
- ERP config: immutable audit log provides change history

#### P2 — No Load Testing

**Recommendation:** Run load tests with realistic concurrency (50-100 concurrent MCP requests) to validate connection pool sizing and response times.

---

## 8. Dependency Management

### 8.1 Current Dependencies

| Package | Version | Risk |
|---------|---------|------|
| @modelcontextprotocol/sdk | ^1.27 | Active development, may have breaking changes |
| fastify | ^5.0 | Stable, well-maintained |
| postgres | ^3.4 | Stable |
| drizzle-orm | ^0.45 | Active development, frequent minor releases |
| zod | ^3.25 | Stable |
| dotenv | ^16 | Stable |

### 8.2 Recommendations

- **P2:** Pin exact versions in production (`npm ci` already uses lockfile)
- **P2:** Set up Dependabot or Renovate for automated dependency updates
- **P3:** Audit for known vulnerabilities: `npm audit`

---

## 9. Production Readiness Checklist

| Category | Status | Notes |
|----------|--------|-------|
| Authentication & Authorization | READY | SHA-256 keys, JWT, RLS |
| Data encryption in transit | NEEDS WORK | Requires HTTPS via reverse proxy |
| Data encryption at rest | NEEDS WORK | ERP credentials stored plaintext |
| Rate limiting | MISSING | No rate limiting on any endpoint |
| Health checks | MISSING | No /health endpoint |
| Structured logging | NEEDS WORK | Unstructured stderr only |
| Error monitoring | MISSING | No external error tracking |
| Backup strategy | MISSING | No automated database backups |
| Disaster recovery | MISSING | No documented recovery plan |
| Load testing | MISSING | No load test results |
| Security audit | NEEDS WORK | No formal audit performed |
| API versioning | NEEDS WORK | No version prefix on endpoints |
| Documentation | READY | HOW_IT_WORKS.md, SETUP.md, TECHNICAL.md |
| Input validation | READY | Zod on all tool params |
| Audit logging | READY | All tool calls logged |
| Multi-tenant isolation | READY | PostgreSQL RLS |
| Graceful shutdown | READY | SIGTERM/SIGINT handled |
| CI/CD pipeline | READY | GitHub Actions |

---

## 10. Prioritized Next Steps

### P0 — Must Fix Before Production

1. **Add rate limiting** — Install `@fastify/rate-limit` with per-IP and per-key limits
2. **Add health check endpoint** — `GET /health` with DB connectivity check
3. **Fix auth connection pooling** — Replace per-request `postgres()` with persistent pool for `lookupApiKeyByHash`, `loadErpConfig`, `listTenants`, `queryAuditLog`
4. **Encrypt ERP credentials at rest** — AES-256-GCM encryption for tenant ERP columns
5. **Configure HTTPS** — Enforce TLS via reverse proxy (Nginx/Caddy)

### P1 — Should Fix Before Production

6. **Add structured logging** — Replace `process.stderr.write()` with pino structured logger
7. **Add retry logic for POSibolt API** — Exponential backoff for transient errors
8. **Conditional CORS** — Only allow localhost origins in development
9. **Encrypt YouTrack token at rest** — Same pattern as ERP credentials
10. **Set up database backups** — Automated `pg_dump` schedule
11. **Cache BP list for contact tools** — TTL cache to avoid 30K+ record fetches per call
12. **Add metrics collection** — Prometheus metrics for request rates, latencies, errors

### P2 — Fix Soon After Launch

13. **Add error monitoring** — Integrate Sentry or similar for error tracking
14. **Load testing** — Validate connection pools under realistic concurrency
15. **API versioning** — Add `/v1/` prefix to admin API routes
16. **Document rollback procedures** — Application and database rollback steps
17. **Add circuit breaker for POSibolt** — Fast-fail when ERP is unavailable
18. **Refactor duplicated SQL in audit-service** — Dynamic query builder
19. **Create txQuery helper** — Eliminate repeated `as unknown as postgres.Sql` casts
20. **Add Dependabot/Renovate** — Automated dependency updates

### P3 — Nice to Have

21. **Redis for token cache** — Shared OAuth token cache for horizontal scaling
22. **Distributed KB scheduler** — pg-boss for multi-instance KB sync
23. **CSRF protection** — Defense-in-depth for admin API
24. **API key rotation workflow** — Smooth key rotation without downtime
25. **Tenant soft-delete** — Archive instead of hard delete

---

## Summary

PB MCP has a **strong architectural foundation** — the multi-tenant isolation via PostgreSQL RLS, the stateless MCP transport design, and the comprehensive audit logging are well-executed. The primary gaps are operational concerns typical of pre-production software: rate limiting, connection pool management, secret encryption, and observability. Addressing the P0 items (5 tasks) is essential before serving production traffic. The P1 items (7 tasks) should follow closely to ensure reliability under real-world conditions.

---

*Analysis performed: 2026-03-24 | PB MCP v2.1*
