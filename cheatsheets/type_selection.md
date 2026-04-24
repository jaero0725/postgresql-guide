# 치트시트: 타입 선택

잘못된 타입 선택은 스토리지·인덱스 크기·쿼리 속도·정확성 모두에 영향을 준다. **기본은 int / text / timestamptz / numeric / uuid**.

---

## 의사결정 트리

```mermaid
flowchart TD
    Q{어떤 데이터?} --> N[숫자]
    Q --> S[문자]
    Q --> T[시간]
    Q --> B[불린/enum]
    Q --> O[기타 구조]

    N --> NI{정수?}
    NI -- "Y, ±10억 이하" --> INT[integer / int4]
    NI -- "Y, 더 크거나 id" --> BIG[bigint / int8]
    NI -- "N, 금액·정확" --> NUM[numeric / decimal]
    NI -- "N, 과학·근사" --> DBL[double precision]

    S --> SL{길이 제한 필수?}
    SL -- "N (대부분)" --> TXT[text]
    SL -- "Y (도메인 규칙)" --> VCH[varchar(N) + CHECK]
    SL -- "고정폭" --> NO[CHAR(N) 지양]

    T --> TZ{타임존 의미 있음?}
    TZ -- "Y (기본)" --> TZS[timestamptz]
    TZ -- "N (벽시계)" --> TS[timestamp]

    B --> BL[boolean]
    B --> EN{값 집합 변동?}
    EN -- "거의 없음" --> ENUM[enum]
    EN -- "자주 변경/다국어" --> LK[lookup table + FK]

    O --> UID[uuid / uuid v7]
    O --> JS{JSON 검색?}
    JS -- "Y" --> JSB[jsonb + GIN]
    JS -- "N, 원본 보관" --> JSN[json]
    O --> AR[array / range]
```

---

## 정수

| 타입 | 바이트 | 범위 | 용도 |
|------|-------|------|-----|
| `smallint` (int2) | 2 | -32,768 ~ 32,767 | 작은 카테고리 코드 |
| `integer` (int4) | 4 | ±21억 | **기본** |
| `bigint` (int8) | 8 | ±9.2경 | 식별자, 카운터 |
| `smallserial/serial/bigserial` | = | sequence 연결 | v10+ `GENERATED AS IDENTITY` 권장 |

```sql
-- 권장: IDENTITY (serial 계열보다 표준/안전)
CREATE TABLE t (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ...
);
```

---

## 소수: 정확 vs 근사

| 타입 | 바이트 | 특성 | 용도 |
|------|-------|------|-----|
| `numeric(p,s)` / `decimal` | 가변 | **정확**, 반올림 없음, 연산 느림 | 돈, 회계, 환율 |
| `real` (float4) | 4 | IEEE 754 ~7 자리 | 과학 근사 |
| `double precision` (float8) | 8 | ~15 자리 | 과학 근사, 위경도 |

```sql
amount numeric(18,2)     -- 소수점 2자리 정확
ratio  double precision  -- 통계/과학
```

**함정:** 돈을 `float` 로 저장하지 말 것. `0.1 + 0.2 = 0.30000000000000004`.

---

## 문자열

| 타입 | 저장 | 언제 |
|------|-----|-----|
| `text` | 가변, 무제한 | **기본** |
| `varchar(N)` | 가변, 최대 N | 외부 스펙·도메인 제약 필요 시 |
| `varchar` (N 없음) | text 와 동일 | text 와 차이 없음 |
| `char(N)` | 고정, 공백 패딩 | **피할 것** (패딩, 비교 혼란) |

```
성능: text = varchar = varchar(N) > char(N)
PostgreSQL 은 TOAST 로 긴 문자열을 자동 압축/외부저장 → 길이 제한이 성능이득 주지 않음
```

### 도메인 제약

```sql
-- 길이 제한은 도메인/체크 제약으로
CREATE DOMAIN email AS text CHECK (value ~ '^[^@]+@[^@]+$');
-- 또는
ALTER TABLE t ADD CONSTRAINT name_len CHECK (char_length(name) <= 100);
```

### Collation

```sql
-- 대소문자 무시 정렬/비교 (v12+)
CREATE COLLATION ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
CREATE TABLE t (name text COLLATE "ci");
```

---

## 날짜/시간

| 타입 | 바이트 | 범위·의미 |
|------|-------|----------|
| `date` | 4 | 년월일 |
| `time` | 8 | 시간(타임존 없음) |
| `timetz` | 12 | 피하자 (시간만으로 타임존 의미 애매) |
| `timestamp` | 8 | 타임존 없음, "벽시계" |
| **`timestamptz`** | 8 | UTC 로 저장, 세션 타임존으로 표시 — **기본 권장** |
| `interval` | 16 | 기간 |

```sql
-- 원칙: timestamptz
created_at timestamptz NOT NULL DEFAULT now()

-- 세션 타임존
SHOW timezone;
SET timezone = 'Asia/Seoul';

-- 안전한 범위 검색
WHERE created_at >= '2025-01-01 00:00+09'
  AND created_at <  '2025-02-01 00:00+09';
```

**함정:** `timestamp` 와 `timestamptz` 를 같은 테이블에 섞지 말 것 — 암묵적 변환이 일어나고 인덱스가 안 맞을 수 있다.

---

## 불린

```sql
is_active boolean NOT NULL DEFAULT true
-- 저장: t/f, 1바이트
```

피할 것: `char(1)` 로 'Y'/'N' 저장. 가독성·연산성·인덱스 모두 손해.

---

## enum vs lookup table

| 선택 | enum | lookup table (+FK) |
|------|------|------|
| 장점 | 1~4바이트, JOIN 불필요, 순서 정의 | 값 추가/삭제/수정 자유, i18n 가능, 메타데이터 |
| 단점 | 값 추가는 `ALTER TYPE` (락), 삭제 어려움 | JOIN 필요, 약간 크다 |
| 언제 | 값 집합 고정 (예: `'asc','desc'`) | 자주 바뀌거나 사용자 정의 |

```sql
CREATE TYPE order_status AS ENUM ('pending','paid','shipped','cancelled');
ALTER TYPE order_status ADD VALUE 'returned';         -- v10+ 트랜잭션 내 가능 (일부 제한)
```

---

## UUID

| 버전 | 생성 | 인덱스 친화 |
|------|-----|-----------|
| v1 (MAC+시간) | 예측 가능 | 시간순, MAC 노출 |
| v4 (랜덤) | `gen_random_uuid()` (pgcrypto or v13+ core) | B-tree 에 **랜덤 삽입 → 캐시 파괴** |
| **v7** (시간 prefix + 랜덤) | 별도 확장/앱 | 시간순 → 인덱스 친화, v18 core 함수 후보 |

```sql
-- v13+
CREATE TABLE t (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ...);

-- 대용량 테이블에서 id 를 uuid 로 쓸 때는 v7 을 추천
-- 또는 bigint IDENTITY + 외부 노출용 uuid 컬럼 분리
```

---

## bytea — 바이너리

```sql
data bytea
-- hex 인코딩 입력
INSERT INTO t VALUES ('\xdeadbeef');
```

큰 파일은 DB 가 아니라 S3 등 외부 스토리지에 — DB 는 메타데이터만.

---

## json vs jsonb

| 타입 | 저장 | 인덱싱 | 언제 |
|------|-----|-------|-----|
| `json` | 텍스트 그대로 (공백/순서 보존) | 불가 (경로 추출 후 expression index 만) | 원본 페이로드 로그 |
| **`jsonb`** | 파싱된 바이너리 | GIN 지원 | **검색/집계 필요 시 기본** |

```sql
-- jsonb + GIN
CREATE INDEX ON orders USING gin (doc);
SELECT * FROM orders WHERE doc @> '{"status":"paid"}';

-- 부분 경로만
CREATE INDEX ON orders USING gin ((doc->'items') jsonb_path_ops);
```

---

## array

```sql
tags text[]
SELECT * FROM t WHERE tags @> ARRAY['sale'];
CREATE INDEX ON t USING gin (tags);
```

정규화 vs 배열 — 카디널리티가 낮고 크기가 작으면 배열, 크면 별도 테이블.

---

## range / multirange

| 타입 | 의미 |
|------|-----|
| `int4range`, `int8range`, `numrange` | 숫자 범위 |
| `tsrange`, `tstzrange`, `daterange` | 시간 범위 |
| `int4multirange`, ... (v14+) | 불연속 구간 |

```sql
-- 예약 시스템 — 겹침 금지
CREATE EXTENSION btree_gist;
CREATE TABLE reservation (
  id bigint GENERATED ALWAYS AS IDENTITY,
  room_id int,
  during tstzrange,
  EXCLUDE USING gist (room_id WITH =, during WITH &&)
);
```

---

## 기타 유용 타입

| 타입 | 용도 |
|------|-----|
| `inet` / `cidr` | IP/네트워크 |
| `macaddr`, `macaddr8` | MAC 주소 |
| `xml` | XML |
| `hstore` | 키-값(단일 레벨) — jsonb 로 대체 추세 |
| `money` | 환경 종속적, **피할 것**. `numeric` 사용 |
| `ltree` | 계층 경로 |
| PostGIS `geometry` / `geography` | 지리정보 |
| `vector` (pgvector) | 임베딩 검색 |

---

## NULL 과 기본값

```sql
-- NULL 은 "정보 없음" — 기본값·빈 문자열과 구별
col text                      -- NULL 허용
col text NOT NULL DEFAULT ''  -- "빈 문자열이 의미 있음" 일 때만
```

NULL 은 B-tree 에서 항상 "크다" 로 정렬 — `ORDER BY col NULLS FIRST/LAST` 로 명시.

---

## 저장 크기 참고

| 타입 | 바이트 |
|------|-------|
| `boolean` | 1 |
| `smallint` | 2 |
| `integer`, `date`, `real` | 4 |
| `bigint`, `double`, `timestamp(tz)`, `time`, `money` | 8 |
| `uuid` | 16 |
| `timestamptz` | 8 |
| `numeric` | 가변 (3+ 바이트) |
| `text`/`varchar` | 1~4 헤더 + 데이터 (2KB 초과 시 TOAST) |

---

## 마이그레이션 함정

```sql
-- int → bigint 는 풀 리라이트 → 긴 잠금
-- 큰 테이블은 v14 ATTACH/DETACH + 새 테이블로 교체 전략

-- enum 값 제거는 직접 불가 — 새 타입 만들어 교체
-- varchar(N) → text 는 무해 (PostgreSQL 내부는 동일)
ALTER TABLE t ALTER COLUMN c TYPE text;
```

---

## 참고

- 데이터 타입: https://www.postgresql.org/docs/current/datatype.html
- 날짜/시간: https://www.postgresql.org/docs/current/datatype-datetime.html
- jsonb: https://www.postgresql.org/docs/current/datatype-json.html
- 범위 타입: https://www.postgresql.org/docs/current/rangetypes.html
