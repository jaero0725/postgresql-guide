# 치트시트: EXPLAIN 출력 해석

쿼리 튜닝의 99%는 **EXPLAIN (ANALYZE, BUFFERS)** 를 정확히 읽는 것에서 시작한다. 단순 `EXPLAIN` 은 추정치만, `ANALYZE` 는 실제 실행. 운영 쿼리는 `ANALYZE` 가 실제로 실행되므로 `SELECT` 외에는 트랜잭션 롤백 안에서 돌린다.

---

## EXPLAIN 옵션

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, WAL, FORMAT TEXT)
SELECT ...;

-- DML 을 안전하게
BEGIN;
EXPLAIN (ANALYZE, BUFFERS) UPDATE ... ;
ROLLBACK;
```

| 옵션 | 의미 | 버전 |
|------|------|------|
| `ANALYZE` | 실제 실행, actual time/rows 포함 | 상시 |
| `BUFFERS` | shared/local/temp block 통계 | 상시 (ANALYZE 없이도 v13+) |
| `VERBOSE` | 출력 컬럼·스키마 한정 이름 | 상시 |
| `SETTINGS` | 기본값과 다른 플래너 GUC 출력 | v12+ |
| `WAL` | 생성된 WAL 바이트·레코드 수 | v13+ |
| `FORMAT` | TEXT \| JSON \| YAML \| XML | 상시 |
| `GENERIC_PLAN` | 파라미터 쿼리의 제네릭 플랜 | v16+ |
| `MEMORY` | 플래너 메모리 사용량 | v17+ |
| `SERIALIZE` | 결과 직렬화 비용 포함 | v17+ |

### auto_explain (운영용)

```ini
shared_preload_libraries = 'pg_stat_statements,auto_explain'
auto_explain.log_min_duration = '500ms'
auto_explain.log_analyze = on
auto_explain.log_buffers = on
auto_explain.log_nested_statements = on
```

---

## 한 줄 읽는 법

```
->  Index Scan using idx_orders_user on orders  (cost=0.43..123.45 rows=100 width=64)
                                                (actual time=0.012..0.823 rows=97 loops=1)
    Index Cond: (user_id = 42)
    Buffers: shared hit=12 read=3
```

| 필드 | 의미 |
|------|-----|
| `cost=A..B` | 첫 행까지 비용 A, 전체 비용 B (단위는 임의) |
| `rows` | 플래너 **추정** 행 수 |
| `width` | 행 평균 바이트 |
| `actual time=A..B` | 첫 행 A ms, 마지막 행 B ms (loop 1회당) |
| `actual rows` | 실제 반환 행 |
| `loops` | 이 노드가 실행된 횟수 |
| `Buffers: shared hit=X read=Y` | 버퍼 캐시 hit X, 디스크 read Y (페이지 8KB) |

**loops > 1 이면 시간·행은 loop당 수치.** 총합 ≈ `actual time × loops`.

---

## 노드 타입 — 언제 나오고 의미는

### 스캔(Scan) 노드

| 노드 | 언제 | 체크 포인트 |
|------|-----|-----------|
| **Seq Scan** | 인덱스 없음 / 전체 큰 부분 읽기 / 작은 테이블 | 큰 테이블에서 나오면 의심. `Rows Removed by Filter` 보기 |
| **Index Scan** | 인덱스로 포인터 찾고 heap 방문 | `Index Cond` = 인덱스가 필터, `Filter` = 재검증 (비효율) |
| **Index Only Scan** | 인덱스만으로 충족 (VM 있어야 정확) | `Heap Fetches` 0이 이상적. 많으면 VACUUM 필요 |
| **Bitmap Index Scan + Bitmap Heap Scan** | 다수 행 + 인덱스 병합 | `Recheck Cond`/`Rows Removed by Index Recheck`; 매우 큰 bitmap → work_mem 부족 (lossy) |
| **Tid Scan** | ctid 로 접근 | 거의 없음 |

### 조인 노드

| 노드 | 언제 | 특징 |
|------|-----|-----|
| **Nested Loop** | 외부 rows 적음 | 외부 rows × 내부 조회 — 외부가 크면 폭발 |
| **Hash Join** | 한쪽 전체가 메모리에 들어감 | 작은 쪽이 hash 되는 게 좋다. `Hash Batches` > 1 이면 work_mem 부족(디스크) |
| **Merge Join** | 양쪽 정렬된 경우 | 입력이 인덱스 순서면 매우 빠름 |

### 집계·정렬 노드

| 노드 | 설명 |
|------|------|
| **Sort** | 메모리 or 디스크. `Sort Method: quicksort Memory: ...` 가 목표, `external merge Disk:` 면 work_mem 부족 |
| **HashAggregate** | GROUP BY, 해시 기반. v13+ 부터 디스크 spill 지원 |
| **GroupAggregate** | 입력이 이미 정렬된 집계 |
| **Incremental Sort** (v13+) | 일부 컬럼이 이미 정렬됨 — LIMIT+ORDER BY 에 유리 |
| **Memoize** (v14+) | Nested Loop 내부 파라미터 캐싱 |

### 병렬/쿼리 구조

| 노드 | 설명 |
|------|------|
| **Gather / Gather Merge** | 병렬 워커 결과 수집. `Workers Planned` vs `Workers Launched` 차이는 리소스 부족 신호 |
| **Append / MergeAppend** | 파티션·UNION ALL |
| **Subquery Scan / CTE Scan** | CTE, subquery 래퍼 |
| **Materialize** | Nested Loop 내부 재사용 위해 메모리 저장 |
| **Limit** | 상위 N |
| **Unique** | DISTINCT |
| **Lock Rows** | FOR UPDATE / SHARE |

---

## Buffers 읽기

```
Buffers: shared hit=100 read=50 dirtied=5 written=2
         local hit=... temp read=1000 written=1000
```

| 값 | 의미 | 목표 |
|----|-----|------|
| `shared hit` | shared_buffers 에서 만족 (메모리) | 많을수록 좋음 |
| `shared read` | 디스크(OS 캐시 또는 실제 I/O)에서 읽음 | 낮을수록 좋음, 총량이 크면 인덱스/캐시 점검 |
| `shared dirtied` | 이 쿼리가 페이지를 더럽힘 | SELECT 에서 나오면 hint bit 또는 HOT 프루닝 |
| `shared written` | 쿼리 도중 WAL/버퍼 writer 가 flush | 많으면 체크포인트/메모리 점검 |
| `temp read/written` | work_mem 초과한 Sort/Hash 의 디스크 spill | **0 이 이상적**. 크면 work_mem 증가 필요 |
| `local hit/read` | 임시 테이블 전용 버퍼 | - |

1 block = 8KB (기본). `read=12500` ≈ 100MB.

---

## 의심 신호 체크리스트

```
[ ] 추정 rows 와 actual rows 가 10배 이상 차이
    → 통계 부족. ANALYZE 또는 default_statistics_target 증가

[ ] Seq Scan + Rows Removed by Filter 가 행 수의 대부분
    → WHERE 컬럼에 인덱스 없음. 또는 함수 래핑으로 인덱스 못 씀

[ ] Bitmap Heap Scan 에서 "lossy" 또는 큰 Recheck
    → work_mem 부족으로 bitmap 압축 → 원인 좁히기

[ ] Sort 에 "external merge Disk:"
    → work_mem 부족. 또는 인덱스로 정렬 제거 가능한지

[ ] Hash Join 의 "Batches" > 1
    → work_mem 부족 → 해시 테이블이 디스크에 spill

[ ] Nested Loop 의 외부 rows 가 수만 이상
    → Hash/Merge Join 이 더 빠를 수 있음. 통계·조인 키 인덱스 점검

[ ] Index Only Scan 의 Heap Fetches 가 크다
    → Visibility Map 이 최신 아님 → VACUUM 필요

[ ] Workers Planned=4, Workers Launched=0
    → max_worker_processes/max_parallel_workers 부족 또는 백엔드 경합

[ ] 작은 테이블(수천 건)에서 Seq Scan
    → 정상. 인덱스 읽기보다 싸다

[ ] 플랜 전체 시간 vs 클라이언트 체감 시간 큰 차이
    → 네트워크/직렬화/애플리케이션 문제 (v17 SERIALIZE 로 측정)
```

---

## 통계 어긋남 진단

```sql
-- 해당 테이블 통계 최근 수집?
SELECT relname, last_analyze, last_autoanalyze, n_live_tup, n_dead_tup
FROM pg_stat_user_tables WHERE relname = 'orders';

-- 분포 수동 확인
ANALYZE orders;
SELECT attname, n_distinct, most_common_vals
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'status';

-- 특정 컬럼 통계 타깃 상향
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;
ANALYZE orders;
```

### Extended Statistics (v10+)

```sql
-- 상관 있는 컬럼들
CREATE STATISTICS stt_orders_city_zip (dependencies, ndistinct, mcv)
  ON city, zip FROM orders;
ANALYZE orders;
```

---

## 자주 쓰는 진단 패턴

```sql
-- 기본 진단
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;

-- JSON 으로 내보내서 explain.depesz.com 에 붙여넣기
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ... \g plan.json

-- 강제 Seq Scan 비교
SET LOCAL enable_indexscan = off; EXPLAIN (ANALYZE, BUFFERS) SELECT ...;

-- work_mem 상향 효과 테스트
SET LOCAL work_mem = '256MB';
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

---

## 빠른 해석 예제

```
Hash Join  (cost=100.00..200.00 rows=50 width=24)
           (actual time=10.0..150.0 rows=5000 loops=1)
  Hash Cond: (a.id = b.a_id)
  Buffers: shared hit=800 read=200
  ->  Seq Scan on a  ...
  ->  Hash  (Buckets: 1024  Batches: 16  Memory Usage: 1024kB)
        ->  Seq Scan on b ...
```

읽기:
- 플래너 추정 50행 vs 실제 5000행 → **통계 어긋남 100배**
- `Batches: 16` → work_mem 부족 → Hash 가 디스크로 떨어짐
- `Buffers read=200` → 200×8KB = 1.6MB 디스크 읽기

---

## 참고

- EXPLAIN: https://www.postgresql.org/docs/current/sql-explain.html
- Using EXPLAIN: https://www.postgresql.org/docs/current/using-explain.html
- auto_explain: https://www.postgresql.org/docs/current/auto-explain.html
- 시각화: https://explain.depesz.com/ , https://explain.dalibo.com/
