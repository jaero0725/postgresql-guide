# 치트시트: PostgreSQL 버전별 주요 변경 (10 ~ 18)

운영 버전 선택과 업그레이드 계획에 쓰는 요약. **각 버전은 최초 릴리스 후 5년간 지원**되며, 매년 11월경 마이너 릴리스가 나온다.

---

## 지원 현황 (2026-04 기준)

| 버전 | 최초 릴리스 | EOL (최종 마이너) | 상태 |
|------|----------|-------------------|------|
| 18 | 2025-09-25 | 2030-11-14 | 지원 |
| 17 | 2024-09-26 | 2029-11-08 | 지원 |
| 16 | 2023-09-14 | 2028-11-09 | 지원 |
| 15 | 2022-10-13 | 2027-11-11 | 지원 |
| 14 | 2021-09-30 | 2026-11-12 | 지원 (올해 EOL) |
| 13 | 2020-09-24 | 2025-11-13 | **EOL** |
| 12 | 2019-10-03 | 2024-11-14 | **EOL** |
| 11 | 2018-10-18 | 2023-11-09 | **EOL** |
| 10 | 2017-10-05 | 2022-11-10 | **EOL** |

**정책:** Major = 5년 지원. Minor 는 보안/버그 픽스만, 호환성 깨지지 않음. 항상 **현재 메이저의 최신 마이너**로 유지 권장.

---

## v10 (2017) — 파티셔닝·논리복제의 시작

- **Declarative Partitioning** (v10 에서 도입, 이후 버전에서 발전)
  - `CREATE TABLE ... PARTITION BY RANGE/LIST`
  - 당시 한계: Partition-wise join 없음, FK 불가, default partition 없음
- **Logical Replication** — `CREATE PUBLICATION/SUBSCRIPTION`
- **Parallel Query 강화** — Index Scan·Bitmap Scan 병렬화
- **Quorum Commit** (`synchronous_standby_names` 에 ANY N)
- **scram-sha-256** 인증
- **Hash index** WAL 지원 (이전엔 복제/크래시 안전 X)
- `pg_basebackup` WAL 스트리밍 기본

---

## v11 (2018) — JIT, PROCEDURE, 파티션 개선

- **JIT 컴파일** (LLVM 기반) — 기본 off, 분석 쿼리 가속
- **PROCEDURE** — `CREATE PROCEDURE` + `CALL`, 내부 트랜잭션 제어
- **Hash Partition** 추가 (Range/List 에 더해)
- **UPDATE on partition key** 허용 → 자동으로 타 파티션 이동
- **Partition 의 FK**, default partition 추가
- **Parallel CREATE INDEX** (B-tree)
- Covering Index (`INCLUDE`) 지원
- `ALTER TABLE ... ADD COLUMN ... DEFAULT <const>` 가 재작성 없이 즉시

---

## v12 (2019) — Generated column, partition 실행시 pruning

- **Generated Columns** (`STORED`) — 표현식 컬럼 영구 저장
- **REINDEX CONCURRENTLY**
- **Partition Pruning at Execution-time** — `IN`, prepared statement, subquery 결과 기반 prune
- Partition 성능 대폭 향상 (수천 파티션 지원)
- **recovery.conf 폐지** — `postgresql.conf` + `recovery.signal` / `standby.signal`
- **PG_STAT_IO_TIMING** refinement, `pg_stat_progress_cluster`, `pg_stat_progress_create_index`
- `CREATE STATISTICS` MCV 지원 (v10 에서 dependencies, ndistinct)
- B-tree 공간 효율·정렬 개선

---

## v13 (2020) — Parallel VACUUM, 인덱스 중복제거

- **Parallel VACUUM** — 인덱스 병렬 처리 (`VACUUM (PARALLEL n)`)
- **B-tree 중복 제거(Deduplication)** — 중복 키 저장 줄여 인덱스 크기 감소
- **Incremental Sort** — 일부 정렬된 입력에 유리
- **Trusted Extensions** — 비 superuser 도 설치 가능
- **Hash Partition Pruning**
- **Disk spill for HashAggregate** (이전에는 메모리 부족 시 OOM 위험)
- **autovacuum_vacuum_insert_threshold / scale_factor** — append-only 테이블 VACUUM 트리거
- Replication slot WAL 사용량 상한 `max_slot_wal_keep_size`
- `pg_stat_progress_analyze`, `pg_stat_progress_basebackup`
- `EXPLAIN (WAL)` 옵션

---

## v14 (2021) — pg_stat_wal, pipeline, ATTACH CONCURRENTLY

- **pg_stat_wal** 뷰 — WAL 생성량 공식 노출
- **libpq pipeline mode** — 네트워크 RTT 감소
- **ALTER TABLE … DETACH PARTITION CONCURRENTLY** (ATTACH 는 파티션에 오래된 잠금 축소)
- **REINDEX TABLE/SCHEMA/DATABASE CONCURRENTLY**
- **Memoize** 노드 — Nested Loop 내부 결과 캐싱
- **multirange** 타입 (`int4multirange` 등)
- **JSON subscripting** — `doc['key']`
- **compute_query_id** — pg_stat_statements/auto_explain 공유 쿼리 id
- 논리복제 스트리밍 (큰 트랜잭션을 커밋 전에 전송)
- `idle_session_timeout`

---

## v15 (2022) — MERGE, 논리복제 강화

- **MERGE** (표준 SQL)
- **pg_basebackup** backup manifests, `zstd` / `lz4` 압축
- **Logical Replication**: 컬럼 필터, 행 필터(WHERE), DDL 준비, two-phase 커밋
- **pg_stat_subscription_stats**
- **NULLS NOT DISTINCT** — `CREATE UNIQUE INDEX … NULLS NOT DISTINCT`
- **ICU as default collation provider** (선택 가능)
- `security_invoker` 뷰
- 정렬/COPY/윈도우 함수 성능 개선
- **public 스키마 CREATE 권한 기본 제거** — 보안 강화 (업그레이드 시 주의)

---

## v16 (2023) — SQL/JSON, pg_stat_io, Logical from standby

- **SQL/JSON 표준** 구문 — `JSON_TABLE`, `IS JSON`, `JSON_OBJECT`, `JSON_ARRAY` 등 확대
- **pg_stat_io** — 백엔드 타입 × 컨텍스트 별 I/O 상세
- **Logical Replication from standby** — 스탠바이에서 논리복제 퍼블리셔 가능
- **pg_dump --filter**, **--load-via-partition-root** 개선
- 병렬 aggregate (string_agg, array_agg), 해시 조인 개선
- 대소문자 무시 ICU `kc-level2`
- ALTER … DEFAULT 유지 채로 타입 변경
- 보안: `pg_maintain` 예비 논의 (v17 채택)

---

## v17 (2024) — 증분 백업, VACUUM 속도, MERGE 확장

- **pg_basebackup --incremental** + **pg_combinebackup** — 공식 증분 백업
- **VACUUM 개선** — 더 작은 메모리로 dead tuple 저장 (TidStore)
- **MERGE … RETURNING**, MERGE 의 뷰 지원
- **pg_stat_checkpointer** (bgwriter 에서 분리)
- **COPY … ON_ERROR = ignore / stop** — 잘못된 행 스킵
- **pg_maintain** 사전정의 롤 — 비 superuser 에게 VACUUM/ANALYZE/REINDEX 권한
- **logical replication 실패 복제 대상** 도 재개 가능 (pg_createsubscriber)
- JSON_TABLE 표준 준수 확대
- `EXPLAIN (SERIALIZE, MEMORY)` 옵션
- 논리복제 업그레이드 시 구독 보존

---

## v18 (2025) — 비동기 I/O, UUIDv7, OAuth

- **비동기 I/O (io_method = io_uring / worker / sync)** — Linux 에서 I/O 효율 개선
- **UUIDv7** 내장 함수 — 시간 정렬 UUID (인덱스 친화)
- **OAuth 2.0** 인증
- `VIRTUAL` Generated Column — 저장 안 하는 표현식 컬럼
- **skip scan** — B-tree 첫 컬럼이 미지정이어도 일부 케이스 지원
- **임시 플랜 통계 / 플래너 튜닝** 다수
- 파티션 identity 컬럼 상속 개선
- 논리복제 DDL 복제(제한적)

---

## 어떤 버전을 운영에 쓸까

| 상황 | 권장 |
|------|------|
| 신규 프로젝트 | **17 또는 18** (최신) |
| 안정 우선, 외부 도구 호환성 | **16** (성숙, 대부분 생태계 호환) |
| 기존 운영 환경 유지 | 최소 **15 이상**으로 업그레이드 계획 |
| 14 사용 중 | 2026-11 EOL — **올해 안에 업그레이드** |
| 13 이하 | EOL. 보안 패치 없음. 즉시 이전 계획 |

**원칙:**
- 메이저 버전 변경은 `pg_upgrade --link` 로 짧은 다운타임
- 프로덕션은 `.0` 출시 후 `.2~.3` 마이너까지 기다린 뒤 도입이 관례
- 지원 기간 절반 이상 남은 버전을 선택 (13→15 보다 16→17)

---

## 마이너 업그레이드

- 같은 메이저 버전 내 (예: 16.3 → 16.5)
- binary 교체 + 재시작만으로 완료, **dump/restore 불필요**
- 릴리스 노트의 "Migration" 섹션 반드시 확인 (간혹 catalog 변경이나 reindex 필요)

---

## 메이저 업그레이드 경로

```
1) pg_dump / pg_restore  — 단순하지만 큰 DB 는 오래 걸림
2) pg_upgrade --link      — 파일 하드링크, 수 분 내 완료
3) Logical replication    — 무중단에 가까움, 버전 차이 허용 (v10+ publisher → 신버전 subscriber)
```

사전 점검:
```bash
# 새 버전 바이너리 설치 후
pg_upgrade --check -b /old/bin -B /new/bin -d /old/data -D /new/data
```

업그레이드 후 필수:
```sql
ANALYZE;                               -- 통계 재수집
REINDEX DATABASE app;                  -- 때때로 (특히 collation 변경 시)
-- 확장(pg_stat_statements 등) 이 새 버전과 맞는지 확인
```

---

## 마이너 릴리스 일정

```
매년 11월 둘째 주 목요일에 전 버전 공동 마이너 릴리스
→ 보안 패치 포함 시 즉각 적용
→ 긴급 CVE 는 사이 기간에도 릴리스 (예: CVE-2024-xxxx)
```

---

## 참고

- Versioning policy: https://www.postgresql.org/support/versioning/
- Release notes (루트): https://www.postgresql.org/docs/release/
- 메이저별 "What's new": https://www.postgresql.org/docs/current/release.html
- pg_upgrade: https://www.postgresql.org/docs/current/pgupgrade.html
