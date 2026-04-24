# chapters — 개념 학습

PostgreSQL의 **내부 동작**과 **운영에 필요한 지식**을 체계적으로 다룬다. 각 장은 "**왜 그런가**"를 함께 설명한다. 공식 문서(postgresql.org/docs, postgresql.kr/docs/13)에 근거하고, 각 문서 말미의 "공식 문서 참조" 블록에서 원문을 확인할 수 있다.

> 📘 전체 가이드 개요는 [../README.md](../README.md) 참고.

---

## 전체 목차

### 1부. PostgreSQL 기초

| # | 장 | 핵심 주제 |
|---|---|---|
| 01 | [PostgreSQL 개요와 설계 철학](ch01_postgresql_overview.md) | ORDBMS, Berkeley 기원, ACID, 다른 DB와의 차이(MySQL/Oracle/ClickHouse/SQLite), Extension 모델 |
| 02 | [아키텍처와 프로세스 모델](ch02_architecture.md) | Postmaster, Backend, 보조 프로세스, Shared Buffer, WAL Buffer, PGDATA 구조 |
| 03 | [MVCC — PostgreSQL 성능과 잠금의 비밀](ch03_mvcc.md) | xmin/xmax/ctid, Snapshot, Visibility, Dead Tuple, HOT Update, XID Wraparound |

### 2부. 스토리지와 인덱스

| # | 장 | 핵심 주제 |
|---|---|---|
| 04 | [Heap, Tuple, Page, TOAST](ch04_storage_tuples_toast.md) | 8KB 페이지 구조, fillfactor, TOAST 4전략, VM/FSM, CTID |
| 05 | [인덱스 타입](ch05_indexes.md) | B-tree / Hash / GIN / GiST / BRIN / SP-GiST 선택, Partial/Expression/Covering |
| 06 | [쿼리 플래너와 EXPLAIN](ch06_query_planner.md) | Cost 모델, 통계, 스캔/조인 전략, EXPLAIN (ANALYZE, BUFFERS), auto_explain |

### 3부. 트랜잭션과 동시성

| # | 장 | 핵심 주제 |
|---|---|---|
| 07 | [트랜잭션과 격리 수준](ch07_transactions_isolation.md) | Read Committed / Repeatable Read / Serializable(SSI), Lock 8단계, Deadlock, Advisory Lock |
| 08 | [VACUUM과 Autovacuum](ch08_vacuum_autovacuum.md) | Bloat, Dead Tuple, XID Wraparound, Autovacuum 튜닝, VACUUM을 막는 4대 요인 |

### 4부. 저장·내구성·고가용성

| # | 장 | 핵심 주제 |
|---|---|---|
| 09 | [WAL과 Checkpoint](ch09_wal_checkpoint.md) | Durability, FPI, checkpoint_timeout, wal_compression, synchronous_commit |
| 10 | [Replication](ch10_replication.md) | Streaming vs Logical, Slot, Hot Standby, 지연 측정(write/flush/replay_lag), 페일오버 |
| 11 | [백업과 복구](ch11_backup_recovery.md) | pg_dump/pg_restore, pg_basebackup, WAL Archiving, PITR, pgBackRest/wal-g |
| 12 | [파티셔닝](ch12_partitioning.md) | RANGE/LIST/HASH, Declarative(v10+), Partition Pruning, ATTACH/DETACH CONCURRENTLY |

### 5부. 운영 실무

| # | 장 | 핵심 주제 |
|---|---|---|
| 13 | [핵심 Extension](ch13_extensions.md) | pg_stat_statements, auto_explain, pgaudit, pg_trgm, PostGIS, pgvector, pg_cron, PgBouncer |
| 14 | [모니터링과 트러블슈팅](ch14_monitoring_troubleshooting.md) | pg_stat_* 뷰, 로그 설정, Lock 분석, 장애 진단 5단계, 외부 도구 |

---

## 추천 학습 경로

### 🟢 처음 읽는 사람 — "PostgreSQL이 어떻게 돌아가나"

```
ch01 (개요) → ch02 (아키텍처) → ch03 (MVCC) → ch04 (스토리지)
```

### 🟡 쿼리 튜너 — "느린 쿼리를 어떻게 보나"

```
ch05 (인덱스) → ch06 (플래너/EXPLAIN) → ch07 (트랜잭션/Lock)
↓
cheatsheets/[explain_reading.md](../cheatsheets/explain_reading.md)
troubleshooting/[B1~B4](../troubleshooting/)
```

### 🟠 운영자/DBA — "장애와 튜닝"

```
ch08 (VACUUM) → ch09 (WAL) → ch10 (Replication) → ch11 (Backup)
↓
ch12 (파티셔닝) → ch13 (Extension) → ch14 (모니터링)
↓
troubleshooting/[A,C,D](../troubleshooting/) 전반
```

---

## 각 장의 구성

모든 장은 다음 요소를 포함한다.

- **개념 설명** — "왜 그런가"를 중심으로
- **Mermaid 다이어그램** — GitHub 렌더링 호환, 장당 2~4개
- **SQL 예제** — 실행 가능한 형태
- **진단 쿼리** — 복붙해서 쓸 수 있는 `pg_stat_*` 쿼리
- **설정 권장치** — 공식 문서 근거
- **실무 관찰 포인트** — 실제 운영에서 보는 지표
- **공식 문서 참조** — 말미에 원문 URL

---

## 관련 폴더

- [../examples/](../examples/) — 도메인 예제로 적용 사례 확인
- [../troubleshooting/](../troubleshooting/) — 장애 케이스 스터디
- [../cheatsheets/](../cheatsheets/) — 빠른 참조가 필요할 때
