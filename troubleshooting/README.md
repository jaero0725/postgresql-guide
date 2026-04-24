# troubleshooting — 장애 케이스 스터디

운영 중 마주치는 장애를 **증상 → 원인 → 진단 → 해결 → 예방** 5단계로 따라가는 케이스 모음. 13개 케이스, 4개 카테고리.

> 📘 전체 가이드 개요는 [../README.md](../README.md) 참고.

---

## 증상으로 빠르게 찾기

| 증상 | 케이스 |
|------|--------|
| 테이블 크기가 계속 커지고 SELECT 느려짐 | [A1. Bloat 누적](A1_bloat_accumulation.md) |
| `database is not accepting commands` 경고 | [A2. XID Wraparound](A2_xid_wraparound.md) |
| Dead Tuple이 쌓이는데 VACUUM이 안 됨 | [A3. 긴 트랜잭션이 VACUUM 차단](A3_long_tx_blocks_vacuum.md) |
| 배포 후 갑자기 Seq Scan 폭주 | [B1. 인덱스 누락](B1_missing_index.md) |
| 인덱스가 있는데 Seq Scan | [B2. Seq Scan with Index](B2_seq_scan_with_index.md) |
| 조인 쿼리가 이상하게 느림, 중간 결과 폭증 | [B3. 잘못된 조인 순서](B3_bad_join_order.md) |
| 동일 패턴 쿼리가 수십·수백 번 실행됨 | [B4. N+1 쿼리](B4_n_plus_one.md) |
| `ERROR: deadlock detected` | [C1. 데드락](C1_deadlock.md) |
| VACUUM이 안 돌고 Lock이 쌓임, `idle in transaction` 다수 | [C2. idle in transaction](C2_idle_in_transaction.md) |
| ALTER TABLE 배포 후 전체 서비스 지연 | [C3. DDL이 쿼리를 막는다](C3_ddl_blocking.md) |
| `FATAL: too many connections` | [D1. Connection 고갈](D1_connection_exhaustion.md) |
| Standby replay_lag 증가 | [D2. Replication Lag](D2_replication_lag.md) |
| `pg_wal/` 폭증, 디스크 풀 임박 | [D3. WAL 디스크 풀](D3_wal_disk_full.md) |

---

## 카테고리별

### A. Autovacuum / Bloat / Wraparound

MVCC와 VACUUM이 얽힌 장애. PostgreSQL의 가장 깊은 아픈 구멍.

| # | 케이스 | 핵심 포인트 |
|---|--------|-----------|
| [A1](A1_bloat_accumulation.md) | **Bloat 누적** | UPDATE-heavy + autovacuum 설정 부적합 + 기본 fillfactor. `pg_stat_user_tables.n_dead_tup`, `pgstattuple`, pg_repack |
| [A2](A2_xid_wraparound.md) | **XID Wraparound** | `datfrozenxid`, 2억/15억/20억 임계선, single-user 복구(전 DB 순회 + `template0`) |
| [A3](A3_long_tx_blocks_vacuum.md) | **긴 TX가 VACUUM 차단** | horizon/OldestXmin 개념, `idle_in_transaction_session_timeout`, prepared xact, replication slot |

관련 챕터: [ch03 MVCC](../chapters/ch03_mvcc.md) · [ch08 VACUUM](../chapters/ch08_vacuum_autovacuum.md)

### B. 쿼리 실수

인덱스와 플래너가 기대대로 동작하지 않는 상황들.

| # | 케이스 | 핵심 포인트 |
|---|--------|-----------|
| [B1](B1_missing_index.md) | **인덱스 누락** | 신규 WHERE 조건, 복합/부분/Covering, `CREATE INDEX CONCURRENTLY` |
| [B2](B2_seq_scan_with_index.md) | **Seq Scan with Index** | 함수 래핑, 타입 불일치, OR, 통계 오래됨, `random_page_cost` SSD 미튜닝 |
| [B3](B3_bad_join_order.md) | **잘못된 조인 순서** | 통계 오차, 상관성 높은 컬럼, `CREATE STATISTICS`, `join_collapse_limit` |
| [B4](B4_n_plus_one.md) | **N+1 쿼리** | ORM Lazy loading, Eager/batch fetch, `IN` 절, LATERAL, DataLoader |

관련 챕터: [ch05 인덱스](../chapters/ch05_indexes.md) · [ch06 플래너](../chapters/ch06_query_planner.md)

### C. Lock

| # | 케이스 | 핵심 포인트 |
|---|--------|-----------|
| [C1](C1_deadlock.md) | **Deadlock** | 잠금 순서 표준화, `SELECT FOR UPDATE` 순서, 재시도 로직, `SKIP LOCKED` |
| [C2](C2_idle_in_transaction.md) | **idle in transaction** | OldestXmin 고정, Bloat 유발, `idle_in_transaction_session_timeout`, try/finally |
| [C3](C3_ddl_blocking.md) | **DDL이 쿼리를 막는다** | AccessExclusiveLock, `lock_timeout`, `CONCURRENTLY`, `NOT VALID → VALIDATE` |

관련 챕터: [ch07 트랜잭션과 Lock](../chapters/ch07_transactions_isolation.md)

### D. 운영 장애

| # | 케이스 | 핵심 포인트 |
|---|--------|-----------|
| [D1](D1_connection_exhaustion.md) | **Connection 고갈** | `max_connections`, PgBouncer transaction mode, 풀 크기 재설계 |
| [D2](D2_replication_lag.md) | **Replication Lag** | write/flush/replay_lag 3단계, recovery conflict, `hot_standby_feedback` 트레이드오프 |
| [D3](D3_wal_disk_full.md) | **WAL 디스크 풀** | 고아 slot, `archive_command` 실패, `wal_keep_size`, `max_slot_wal_keep_size` 안전장치 |

관련 챕터: [ch09 WAL](../chapters/ch09_wal_checkpoint.md) · [ch10 Replication](../chapters/ch10_replication.md) · [ch14 모니터링](../chapters/ch14_monitoring_troubleshooting.md)

---

## 장애 대응 일반 원칙

```
1. 침착함 > 빠름 — 잘못된 DDL·VACUUM FULL·kill은 사태를 악화시킨다.
2. 진단 순서: 연결 수 → Lock → 긴 트랜잭션 → 쿼리 → 리소스
3. 로그 먼저 보기: log_lock_waits, log_checkpoints, log_min_duration_statement
4. "무엇이 빠르게 가역적인가"를 기준으로 조치 순서 정렬
5. 복구 후: 재발 방지 설정 · 모니터링 · 진단 쿼리를 워크북화
```

우선 실행해야 할 진단 쿼리는 [../cheatsheets/pg_stat_queries.md](../cheatsheets/pg_stat_queries.md)에 모아두었다.

---

## 각 케이스의 구성

모든 케이스는 다음 포맷을 따른다.

- **증상 박스** — 한 줄 요약 + 지표 표
- **실제 상황 (재현 시나리오)** — 스키마, 데이터 규모, 부하 조건
- **원인 분석** — "왜 그렇게 되는가"
- **진단 쿼리** — 복붙 가능한 `pg_stat_*` 쿼리
- **해결 방법** — 단계별 조치
- **예방 원칙** — 체크리스트
- **Mermaid 다이어그램** — 문제 흐름 / 조치 순서
- **관련 챕터**

---

## 관련 폴더

- [../chapters/](../chapters/) — 장애 근본 원리 이해
- [../cheatsheets/](../cheatsheets/pg_stat_queries.md) — 진단 쿼리 모음
- [../examples/](../examples/) — 예제에서 등장하는 운영 패턴
