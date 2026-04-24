# 치트시트: postgresql.conf 필수 파라미터

"운영용 초기 설정"에 포함되어야 할 핵심 파라미터 목록. 기본값은 1995년 8MB 머신에도 돌아가도록 설계돼 있어 **운영에는 대부분 부족**.

---

## 적용·확인 명령

```sql
-- 현재 값
SHOW shared_buffers;
SELECT name, setting, unit, context, source FROM pg_settings WHERE name = 'work_mem';

-- 세션/트랜잭션 단위 변경
SET work_mem = '256MB';                    -- 세션
SET LOCAL work_mem = '256MB';              -- 트랜잭션만

-- reload 로 충분한지 (context='sighup'), 재시작 필요인지 (context='postmaster')
SELECT name, context FROM pg_settings WHERE name IN ('shared_buffers','work_mem');

-- 설정 파일 위치
SHOW config_file;

-- reload (관리자)
SELECT pg_reload_conf();
```

---

## 메모리

| 파라미터 | 기본 | 권장 | 재시작? | 의미 |
|---------|-----|------|--------|-----|
| `shared_buffers` | 128MB | **RAM × 25%** | 재시작 | PostgreSQL 전용 캐시 |
| `effective_cache_size` | 4GB | **RAM × 50~75%** | reload | 플래너용 "사용 가능한 캐시 추정" (실제 할당 X) |
| `work_mem` | 4MB | **16~64MB** (동접·쿼리 복잡도에 따라) | reload | 정렬/해시 노드 **1개당** 한도 |
| `maintenance_work_mem` | 64MB | **1~2GB** | reload | VACUUM/CREATE INDEX/REINDEX |
| `hash_mem_multiplier` (v13+) | 2.0 | 2.0~4.0 | reload | Hash 노드의 work_mem 배수 |
| `temp_buffers` | 8MB | 그대로 | reload | 임시 테이블 전용 |
| `huge_pages` | try | try (Linux) | 재시작 | 큰 shared_buffers 일수록 권장 |

**work_mem 계산:**
```
대략 피크 메모리 ≈ max_connections × work_mem × (평균 복잡 쿼리의 sort/hash 노드 수)
→ OOM 피하려면 동접 × work_mem 이 RAM 을 넘지 않도록
→ 동접 높으면 work_mem 낮추고, 배치 작업은 세션별 SET
```

---

## 쓰기 / WAL / Checkpoint

| 파라미터 | 기본 | 권장 | 재시작? | 의미 |
|---------|-----|------|--------|-----|
| `wal_level` | replica | replica (복제 무) / **logical** (CDC, 논리복제) | 재시작 | |
| `synchronous_commit` | on | on (일반) / off (로그류 내구성 타협) | reload | off 면 커밋 응답 빠름, 크래시 시 최대 몇 ms 손실 |
| `wal_compression` | off (모든 버전 기본) | **on** 또는 **lz4/zstd** (v15+) | reload | FPI 압축 — I/O 절감. v15 이전은 pglz만, v15+는 pglz/lz4/zstd 선택 |
| `wal_buffers` | -1 (자동) | 자동 | 재시작 | shared_buffers 1/32 |
| `checkpoint_timeout` | 5min | **15~30min** | reload | 체크포인트 최대 주기 |
| `max_wal_size` | 1GB | **4~16GB** (쓰기량에 맞춰) | reload | 이 크기 차면 조기 checkpoint |
| `min_wal_size` | 80MB | **1~4GB** | reload | WAL 파일 재활용 하한 |
| `checkpoint_completion_target` | 0.9 | 0.9 | reload | 체크포인트 확산율 |
| `full_page_writes` | on | **on 유지** | reload | 끄면 crash 시 torn page |
| `archive_mode` | off | PITR 하면 on | 재시작 | |
| `archive_command` | '' | **`pgbackrest ...` 또는 `wal-g wal-push %p` 권장**. 자체 스크립트는 `cmp -s` 검증 필수 | reload | 단순 `test ! -f && cp`는 내용 검증 없어 무한 재시도 위험 |
| `archive_timeout` | 0 | 운영 기준 5~15min | reload | 유휴 시 강제 WAL 스위치 |

### 복제 관련

| 파라미터 | 기본 | 권장 | |
|---------|-----|------|--|
| `max_wal_senders` | 10 | 10~20 | 스트리밍 연결 수 |
| `max_replication_slots` | 10 | 10~20 | 물리+논리 슬롯 총합 |
| `hot_standby` | on | on | 스탠바이에서 읽기 허용 |
| `hot_standby_feedback` | off | 쿼리 많이 도는 스탠바이면 on | 주: primary 에 VACUUM 지연 유발 |
| `wal_receiver_timeout` | 60s | 60s | |
| `wal_keep_size` (v13+) | 0 | 슬롯 없이 복제 시 16GB+ | WAL 재활용 방지 |

---

## 연결 / 리소스

| 파라미터 | 기본 | 권장 | 재시작? | 의미 |
|---------|-----|------|--------|-----|
| `max_connections` | 100 | **100~300** (pgBouncer 앞세우면 작게) | 재시작 | |
| `superuser_reserved_connections` | 3 | 5 | 재시작 | 장애 시 superuser 접속 여유 |
| `idle_in_transaction_session_timeout` | 0 | **60s~5min** | reload | VACUUM blocker 방지 |
| `idle_session_timeout` (v14+) | 0 | 30min | reload | 유휴 세션 정리 |
| `statement_timeout` | 0 | 운영 쿼리군별 설정 | reload | 긴 쿼리 차단 (세션/유저별 권장) |
| `lock_timeout` | 0 | 2~10s (마이그레이션 세션) | reload | 락 대기 상한 |

```sql
-- 유저별 세팅 (마이그레이션/백오피스)
ALTER ROLE migrator SET statement_timeout = '30min';
ALTER ROLE app_ro    SET statement_timeout = '30s';
```

---

## 플래너 / 쿼리

| 파라미터 | 기본 | 권장 | 의미 |
|---------|-----|------|-----|
| `random_page_cost` | 4.0 | **SSD/NVMe: 1.1**, HDD: 4 | 인덱스 스캔 비용 |
| `seq_page_cost` | 1.0 | 1.0 | 순차 읽기 비용 |
| `effective_io_concurrency` | 1 (~PG17) / 16 (PG18+) | **SSD 200, NVMe 256** | prefetch 병렬도. PG18부터 기본값이 16으로 상향됨 |
| `maintenance_io_concurrency` (v13+) | 10 | 10~256 | 인덱스 빌드/VACUUM prefetch |
| `default_statistics_target` | 100 | 100 (기본), 큰 테이블 컬럼만 1000 | ANALYZE 샘플 크기 |
| `jit` (v11+) | on | OLTP 는 **off**, 분석 OLAP 는 on | JIT 컴파일 비용이 짧은 쿼리엔 손해 |
| `jit_above_cost` | 100000 | OLTP 는 크게 (500000+) | JIT 발동 임계 |
| `parallel_tuple_cost` / `parallel_setup_cost` | 0.1 / 1000 | 그대로 | 병렬 쿼리 임계 |
| `max_parallel_workers_per_gather` | 2 | 2~4 (코어 수) | 쿼리당 병렬 워커 |
| `max_parallel_workers` | 8 | CPU 코어의 50% | 전체 병렬 워커 풀 |
| `max_worker_processes` | 8 | 코어 수 이상 | 위의 상한 |

---

## 로깅 — 운영 필수

| 파라미터 | 기본 | 권장 | 의미 |
|---------|-----|------|-----|
| `logging_collector` | off | **on** | 자체 로그 파일 |
| `log_destination` | stderr | stderr,csvlog | csvlog 는 파싱 용이 |
| `log_directory` | log | log | |
| `log_filename` | postgresql-%Y-%m-%d_%H%M%S.log | `postgresql-%Y-%m-%d.log` | |
| `log_rotation_age` | 1d | 1d | |
| `log_rotation_size` | 10MB | 100MB | |
| `log_line_prefix` | '%m [%p] ' | `'%m [%p] %q%u@%d app=%a '` | 사용자·DB·앱명 포함 |
| `log_min_duration_statement` | -1 | **500ms~1s** | 느린 쿼리 모두 기록 |
| `log_min_error_statement` | error | error | |
| `log_checkpoints` | on (v15+) | **on** | 체크포인트 시작/끝 |
| `log_autovacuum_min_duration` | 10min (v17+ 기본) / -1 | **0 or 1s** | autovacuum 기록 |
| `log_lock_waits` | off | **on** | deadlock_timeout 이상 대기 기록 |
| `log_temp_files` | -1 | **0** | work_mem 부족으로 spill 기록 |
| `log_connections` | off | on (디버깅 기간) | |
| `log_disconnections` | off | on (디버깅 기간) | |
| `log_statement` | none | ddl (일반) / mod (상세) | all 은 절대 금지 |
| `deadlock_timeout` | 1s | 1s | 이만큼 대기하면 deadlock 검사 |

---

## 확장·모니터링

```ini
shared_preload_libraries = 'pg_stat_statements,auto_explain'

# pg_stat_statements
pg_stat_statements.max = 10000
pg_stat_statements.track = top       # top | all | none
pg_stat_statements.save = on
compute_query_id = on                # v14+

# auto_explain
auto_explain.log_min_duration = '500ms'
auto_explain.log_analyze = on
auto_explain.log_buffers = on
auto_explain.log_verbose = off
auto_explain.log_nested_statements = on
auto_explain.log_timing = on         # 오버헤드 있음
auto_explain.sample_rate = 1.0
```

설치 후:
```sql
CREATE EXTENSION pg_stat_statements;  -- DB 마다
```

---

## 보안

| 파라미터 | 권장 | 의미 |
|---------|------|-----|
| `ssl` | on | |
| `ssl_cert_file` / `ssl_key_file` | 지정 | |
| `password_encryption` | `scram-sha-256` | v10+ 기본 |
| `row_security` | on | RLS 활성 |
| `listen_addresses` | 필요한 주소만 | `'*'` 은 방화벽·pg_hba 로 보완 |

`pg_hba.conf` — 접근 제어 핵심. `trust` 는 개발 환경 외엔 금지.

---

## 시작값 예제 (16GB RAM / 4 core / SSD OLTP)

```ini
# --- Memory ---
shared_buffers = 4GB
effective_cache_size = 12GB
work_mem = 32MB
maintenance_work_mem = 1GB
huge_pages = try

# --- Connections ---
max_connections = 200
idle_in_transaction_session_timeout = '60s'

# --- WAL / Checkpoint ---
wal_level = replica
synchronous_commit = on
wal_compression = lz4
checkpoint_timeout = 15min
max_wal_size = 8GB
min_wal_size = 1GB

# --- Planner ---
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 100
jit = off

# --- Parallel ---
max_worker_processes = 8
max_parallel_workers = 4
max_parallel_workers_per_gather = 2

# --- Autovacuum ---
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 30s
log_autovacuum_min_duration = 1s

# --- Logging ---
logging_collector = on
log_filename = 'postgresql-%Y-%m-%d.log'
log_line_prefix = '%m [%p] %q%u@%d app=%a '
log_min_duration_statement = 500ms
log_checkpoints = on
log_lock_waits = on
log_temp_files = 0

# --- Extensions ---
shared_preload_libraries = 'pg_stat_statements,auto_explain'
pg_stat_statements.track = top
compute_query_id = on
auto_explain.log_min_duration = '1s'
auto_explain.log_analyze = on
auto_explain.log_buffers = on

# --- Security ---
password_encryption = scram-sha-256
ssl = on
```

---

## "언제 바꾸는가" 요약

| 증상 | 건드릴 파라미터 |
|------|---------------|
| Sort/Hash 가 디스크 spill | `work_mem` 상향, `hash_mem_multiplier` |
| Checkpoint I/O 스파이크 | `checkpoint_timeout` ↑, `max_wal_size` ↑ |
| 느린 쿼리 로그 안 남음 | `log_min_duration_statement = 500ms` |
| 인덱스를 안 탐 (추정 비용이 Seq 보다 큼) | `random_page_cost` 를 1.1~2 로 |
| OOM | `work_mem` 하향, `max_connections` 하향 + pgBouncer |
| VACUUM 느림 | `maintenance_work_mem` ↑, `autovacuum_vacuum_cost_limit` ↑ |
| Standby lag | 네트워크·디스크 점검 + `hot_standby_feedback` 평가 |
| 긴 트랜잭션 문제 | `idle_in_transaction_session_timeout` |
| XID wraparound 경보 | `autovacuum_freeze_max_age` 확인, 수동 `VACUUM FREEZE` |

---

## 참고

- Runtime config: https://www.postgresql.org/docs/current/runtime-config.html
- Resource usage: https://www.postgresql.org/docs/current/runtime-config-resource.html
- WAL: https://www.postgresql.org/docs/current/runtime-config-wal.html
- Query Planning: https://www.postgresql.org/docs/current/runtime-config-query.html
- pgtune (참고용 generator): https://pgtune.leopard.in.ua/
