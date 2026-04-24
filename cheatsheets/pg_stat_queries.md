# 치트시트: 진단 쿼리 모음

장애 대응 / 튜닝 / 일상 모니터링에 쓰는 진단 쿼리 모음. 모두 **복사해서 psql 에 바로 붙여넣어** 쓸 수 있도록 구성.

사전 준비:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- postgresql.conf: shared_preload_libraries = 'pg_stat_statements'
```

---

## 1. 현재 활동 — 장시간/블록된 쿼리

```sql
-- 현재 활성 세션 (idle 제외), 오래된 순
SELECT pid,
       usename,
       application_name,
       client_addr,
       state,
       wait_event_type || ':' || wait_event AS wait,
       now() - query_start AS runtime,
       now() - xact_start  AS xact_age,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS query
FROM pg_stat_activity
WHERE state <> 'idle'
  AND pid <> pg_backend_pid()
ORDER BY runtime DESC NULLS LAST
LIMIT 30;
```

```sql
-- idle in transaction — VACUUM blocker
SELECT pid, usename, application_name,
       state, now() - state_change AS idle_for,
       now() - xact_start AS xact_age,
       left(query, 120) AS last_query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY xact_age DESC;
```

```sql
-- 특정 세션 cancel / terminate
SELECT pg_cancel_backend(12345);     -- 쿼리만 취소 (권장 우선)
SELECT pg_terminate_backend(12345);  -- 세션 종료
```

---

## 2. Lock — 누가 누구를 막나

```sql
-- 대기 중인 세션과 block 하는 세션 매핑
SELECT
  w.pid         AS waiting_pid,
  w.usename     AS waiting_user,
  w.wait_event,
  now() - w.xact_start AS waiting_for,
  left(w.query, 80) AS waiting_query,
  b.pid         AS blocking_pid,
  b.usename     AS blocking_user,
  b.state       AS blocking_state,
  left(b.query, 80) AS blocking_query
FROM pg_stat_activity w
JOIN LATERAL unnest(pg_blocking_pids(w.pid)) AS bp(pid) ON true
JOIN pg_stat_activity b ON b.pid = bp.pid
WHERE w.wait_event IS NOT NULL
ORDER BY waiting_for DESC;
```

```sql
-- Lock 상세 (어떤 객체에 어떤 mode)
SELECT l.locktype, l.mode, l.granted,
       l.relation::regclass AS relation,
       a.pid, a.usename, a.state, a.wait_event,
       left(a.query, 80) AS query
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE NOT l.granted
   OR l.relation IS NOT NULL
ORDER BY l.granted, a.query_start;
```

```sql
-- wait_event 상위 집계 (현재 스냅샷)
SELECT wait_event_type, wait_event, count(*)
FROM pg_stat_activity
WHERE state <> 'idle'
GROUP BY 1,2
ORDER BY 3 DESC;
```

---

## 3. 느린 쿼리 Top — pg_stat_statements

```sql
-- 총 시간 Top (누적 영향력 큰 쿼리 발견)
SELECT
  round(total_exec_time::numeric/1000, 1)  AS total_sec,
  calls,
  round(mean_exec_time::numeric, 2)        AS mean_ms,
  round(stddev_exec_time::numeric, 2)      AS stddev_ms,
  round((100.0*total_exec_time/sum(total_exec_time) OVER ())::numeric, 1) AS pct,
  rows,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

```sql
-- 평균 느린 쿼리 Top (찾기 어려운 튜닝 대상)
SELECT round(mean_exec_time::numeric, 2) AS mean_ms,
       calls,
       round(total_exec_time::numeric/1000, 1) AS total_sec,
       left(query, 160) AS query
FROM pg_stat_statements
WHERE calls > 10
ORDER BY mean_exec_time DESC
LIMIT 20;
```

```sql
-- 가장 많이 실행되는 쿼리
SELECT calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(total_exec_time::numeric/1000, 1) AS total_sec,
       left(query, 160) AS query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;
```

```sql
-- I/O 무거운 쿼리
SELECT
  round(total_exec_time::numeric/1000, 1) AS total_sec,
  calls,
  shared_blks_read,                          -- 디스크 읽기 (8KB 단위)
  shared_blks_hit,
  shared_blks_dirtied,
  temp_blks_read + temp_blks_written AS temp_blks,
  round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit+shared_blks_read, 0), 1) AS hit_pct,
  left(query, 160) AS query
FROM pg_stat_statements
WHERE shared_blks_read + temp_blks_written > 0
ORDER BY shared_blks_read DESC
LIMIT 20;
```

```sql
-- WAL 생성 많은 쿼리 (v13+)
SELECT round(total_exec_time::numeric/1000,1) AS total_sec,
       calls, wal_records, wal_bytes,
       pg_size_pretty(wal_bytes) AS wal_size,
       left(query, 160) AS query
FROM pg_stat_statements
ORDER BY wal_bytes DESC
LIMIT 20;
```

```sql
-- 초기화 (베이스라인 리셋)
SELECT pg_stat_statements_reset();
```

---

## 4. 인덱스 사용률

```sql
-- 전혀 안 쓰이는 인덱스 (UNIQUE/PK 제외)
SELECT s.schemaname,
       s.relname     AS table,
       s.indexrelname AS index,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
       s.idx_scan
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique
  AND s.schemaname NOT IN ('pg_catalog','pg_toast')
ORDER BY pg_relation_size(s.indexrelid) DESC
LIMIT 50;
```

```sql
-- 중복/유사 인덱스 탐지 (같은 테이블, 같은 컬럼 시작)
SELECT indrelid::regclass AS table,
       array_agg(indexrelid::regclass ORDER BY indexrelid) AS indexes
FROM pg_index
WHERE indrelid::regclass::text NOT LIKE 'pg_%'
GROUP BY indrelid, (indkey::int2[])[0:0]    -- 첫 컬럼 기준
HAVING count(*) > 1
ORDER BY count(*) DESC;
```

```sql
-- Seq Scan 많은 테이블 — 인덱스 후보
SELECT schemaname, relname,
       seq_scan, seq_tup_read,
       idx_scan, idx_tup_fetch,
       n_live_tup,
       round(100.0*idx_scan/NULLIF(seq_scan+idx_scan,0), 1) AS idx_pct
FROM pg_stat_user_tables
WHERE n_live_tup > 10000
ORDER BY seq_tup_read DESC
LIMIT 20;
```

---

## 5. 테이블 크기·Bloat

```sql
-- 가장 큰 테이블 (heap + 인덱스 + TOAST)
SELECT schemaname, relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS total,
       pg_size_pretty(pg_relation_size(relid))       AS heap,
       pg_size_pretty(pg_indexes_size(relid))        AS indexes,
       pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid) - pg_indexes_size(relid)) AS toast,
       n_live_tup, n_dead_tup
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

```sql
-- Dead tuple 비율 Top
SELECT schemaname, relname,
       n_live_tup, n_dead_tup,
       round(100.0*n_dead_tup/NULLIF(n_live_tup,0),2) AS dead_pct,
       last_autovacuum,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY dead_pct DESC NULLS LAST
LIMIT 20;
```

```sql
-- 정밀 Bloat (pgstattuple, 비쌈)
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT * FROM pgstattuple_approx('orders');
```

---

## 6. VACUUM / ANALYZE 상태

```sql
-- 진행 중 VACUUM
SELECT p.pid, c.relname, p.phase,
       p.heap_blks_total, p.heap_blks_scanned, p.heap_blks_vacuumed,
       round(100.0*p.heap_blks_scanned/NULLIF(p.heap_blks_total,0),1) AS scan_pct
FROM pg_stat_progress_vacuum p
JOIN pg_class c ON c.oid = p.relid;

-- 진행 중 CREATE INDEX
SELECT * FROM pg_stat_progress_create_index;

-- 진행 중 ANALYZE
SELECT * FROM pg_stat_progress_analyze;      -- v13+
```

```sql
-- XID 위험도
SELECT datname,
       age(datfrozenxid) AS xid_age,
       round(100.0 * age(datfrozenxid) / 2000000000, 2) AS pct_wraparound
FROM pg_database
ORDER BY xid_age DESC;
```

---

## 7. Replication

```sql
-- Primary 에서 — 각 스탠바이 lag
SELECT application_name, client_addr, state, sync_state,
       pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn)   AS sent_lag_bytes,
       pg_wal_lsn_diff(pg_current_wal_lsn(), write_lsn)  AS write_lag_bytes,
       pg_wal_lsn_diff(pg_current_wal_lsn(), flush_lsn)  AS flush_lag_bytes,
       pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS replay_lag_bytes,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;
```

```sql
-- Standby 에서 — 지연 시간
SELECT now() - pg_last_xact_replay_timestamp() AS replay_delay,
       pg_is_in_recovery() AS is_standby;
```

```sql
-- Replication slot 상태
SELECT slot_name, slot_type, database, active,
       restart_lsn,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal,
       temporary
FROM pg_replication_slots;
```

---

## 8. 연결·세션 집계

```sql
-- 상태별 접속 수
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state
ORDER BY count(*) DESC;

-- DB·유저별
SELECT datname, usename, application_name, count(*)
FROM pg_stat_activity
GROUP BY 1,2,3
ORDER BY count(*) DESC;

-- 접속 한도 대비
SELECT count(*) AS used,
       current_setting('max_connections')::int AS max_conn,
       round(100.0*count(*)/current_setting('max_connections')::int, 1) AS used_pct
FROM pg_stat_activity;
```

---

## 9. Cache / I/O 상태

```sql
-- 데이터베이스 캐시 히트율
SELECT datname,
       round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) AS hit_pct,
       blks_hit, blks_read,
       xact_commit, xact_rollback,
       deadlocks, temp_files, temp_bytes
FROM pg_stat_database
WHERE datname NOT IN ('template0','template1');

-- 테이블 단위 캐시 히트율
SELECT schemaname, relname,
       heap_blks_hit, heap_blks_read,
       round(100.0 * heap_blks_hit / NULLIF(heap_blks_hit+heap_blks_read, 0), 2) AS hit_pct,
       idx_blks_hit, idx_blks_read
FROM pg_statio_user_tables
ORDER BY heap_blks_read DESC
LIMIT 20;
```

```sql
-- pg_stat_io (v16+)
SELECT backend_type, object, context,
       reads, writes, extends, hits, evictions,
       round(1000.0 * read_time / NULLIF(reads,0), 2) AS avg_read_us,
       round(1000.0 * write_time / NULLIF(writes,0), 2) AS avg_write_us
FROM pg_stat_io
ORDER BY reads + writes DESC;
```

---

## 10. Checkpoint / BGWriter

```sql
-- v17 이전
SELECT * FROM pg_stat_bgwriter;

-- v17+ 에서는 pg_stat_checkpointer 가 분리됨
SELECT * FROM pg_stat_checkpointer;
SELECT * FROM pg_stat_bgwriter;
```

핵심 지표:
- `checkpoints_timed` vs `checkpoints_req` : 요청 기반이 많으면 `max_wal_size` ↑
- `buffers_backend` : 백엔드가 직접 flush — 많으면 `bgwriter` 더 공격적으로

---

## 11. Deadlock / 오류 집계

```sql
-- DB 별 deadlock 발생 수
SELECT datname, deadlocks, conflicts,
       xact_commit, xact_rollback,
       round(100.0*xact_rollback/NULLIF(xact_commit+xact_rollback,0), 2) AS rollback_pct
FROM pg_stat_database
WHERE datname NOT IN ('template0','template1');
```

로그에서 추적:
```bash
grep -E 'deadlock detected|could not obtain lock' postgresql-*.log
```

---

## 12. 테이블 생성 후 안 쓰이는 / 통계 오래됨

```sql
-- ANALYZE 오래된 테이블
SELECT schemaname, relname,
       n_live_tup, n_mod_since_analyze,
       last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE n_mod_since_analyze > 10000
ORDER BY n_mod_since_analyze DESC
LIMIT 20;
```

---

## 13. 권한 / 소유

```sql
-- 특정 테이블 권한
\dp schema.table

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='orders';

-- 오브젝트 소유자
SELECT n.nspname, c.relname, r.rolname AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE n.nspname = 'public';
```

---

## 참고

- pg_stat_activity: https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW
- pg_stat_statements: https://www.postgresql.org/docs/current/pgstatstatements.html
- Monitoring: https://www.postgresql.org/docs/current/monitoring-stats.html
- Lock 모니터링: https://wiki.postgresql.org/wiki/Lock_Monitoring
