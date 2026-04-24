# 치트시트: psql 명령 레퍼런스

psql 은 PostgreSQL 의 공식 CLI. 메타커맨드(`\...`)와 SQL 을 섞어 쓸 수 있고, 숙련되면 GUI 툴보다 훨씬 빠르다.

---

## 접속

```bash
# 기본 형태
psql -h HOST -p 5432 -U USER -d DBNAME

# URI 형태 (스크립트에서 권장)
psql "postgresql://user:pw@host:5432/db?sslmode=require"
psql "postgres://user@host/db?application_name=migrator"

# 소켓 접속 (로컬)
psql -U postgres

# 쿼리 한 방 실행
psql -d mydb -c "SELECT now();"
psql -d mydb -f migrate.sql

# stdin 파이프
echo "SELECT 1" | psql -d mydb
```

### 암호 관리

```bash
# 1) ~/.pgpass  (chmod 600 필수)
# host:port:db:user:password
echo "db.prod.local:5432:*:app_ro:s3cret" >> ~/.pgpass
chmod 600 ~/.pgpass

# 2) 환경변수
export PGPASSWORD='s3cret'   # 쉘 history 주의
export PGHOST=db.prod.local PGPORT=5432 PGUSER=app_ro PGDATABASE=app

# 3) service 파일 (~/.pg_service.conf)
# [prod]
# host=db.prod.local
# port=5432
# dbname=app
# user=app_ro
psql service=prod
```

---

## 메타커맨드 — 기본 표

| 명령 | 의미 |
|------|-----|
| `\l` / `\l+` | DB 목록 (+크기) |
| `\c DBNAME [USER]` | DB 전환 |
| `\dn` / `\dn+` | 스키마 목록 |
| `\dt [pattern]` | 테이블 목록 |
| `\dt+` | 테이블 + 크기 |
| `\di` / `\di+` | 인덱스 목록 |
| `\dv` | 뷰 목록 |
| `\dm` | 머티리얼라이즈드 뷰 |
| `\ds` | 시퀀스 |
| `\df` / `\df+` | 함수 목록 |
| `\df procname` | 특정 함수 시그니처 |
| `\dx` | 설치된 확장 |
| `\dx+ extname` | 확장이 제공하는 객체 |
| `\du` / `\dg` | 롤/그룹 |
| `\dp` / `\z` | 객체 권한 (GRANT) |
| `\dd [pattern]` | COMMENT 조회 |
| `\dT+` | 타입(도메인/enum 포함) |
| `\dD` | 도메인 |
| `\dO` | Collation |
| `\d OBJ` | 객체 정의 |
| `\d+ OBJ` | + 크기·통계·storage·주석 |
| `\sf funcname` | 함수 본문 출력 |
| `\ef funcname` | 함수 본문을 편집기에서 열기 |
| `\sv viewname` | 뷰 정의 출력 |
| `\ev viewname` | 뷰 정의 편집 |

### 패턴 매칭

```sql
\dt public.*          -- public 스키마 전체
\dt *.user_*          -- 모든 스키마의 user_ 시작 테이블
\df pg_catalog.pg_*   -- 함수 이름 매칭
```

---

## 실행·편집·파일 I/O

| 명령 | 의미 |
|------|-----|
| `\e` | 직전 쿼리를 `$EDITOR` 로 편집 후 실행 |
| `\e file.sql` | 파일 열어 편집 후 실행 |
| `\i file.sql` | 파일 실행 |
| `\ir file.sql` | 현재 스크립트 기준 상대경로로 실행 |
| `\o out.txt` | 이후 결과를 파일로 저장 |
| `\o` | 출력 파일 닫기 (다시 stdout) |
| `\g file` | 직전 쿼리 결과를 파일로 |
| `\g \| cmd` | 결과를 외부 명령으로 파이프 |
| `\w file` | 쿼리 버퍼를 파일로 저장 |
| `\! cmd` | 쉘 명령 실행 |
| `\s [file]` | 명령 히스토리 표시/저장 |
| `\copy` | 서버가 아닌 **클라이언트** 측 파일로 COPY |

### \copy 예제

```sql
-- CSV 내보내기 (클라이언트 로컬 파일)
\copy (SELECT * FROM orders WHERE created_at >= current_date - 7) TO 'orders.csv' CSV HEADER

-- CSV 가져오기
\copy staging.events FROM 'events.csv' CSV HEADER NULL ''

-- 서버측 COPY (superuser 또는 pg_read_server_files 권한 필요)
COPY staging.events FROM '/var/lib/pg/events.csv' CSV HEADER;
```

---

## 고급: \watch, \gexec, \crosstabview

```sql
-- 2초마다 자동 반복 (v14+ : \watch i=N c=COUNT)
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
\watch 2

-- 쿼리 결과의 각 행을 "SQL 문"으로 실행
SELECT format('REINDEX INDEX CONCURRENTLY %I.%I;', schemaname, indexrelname)
FROM pg_stat_user_indexes
WHERE idx_scan = 0;
\gexec

-- 결과를 피벗 테이블 형태로
SELECT region, product, sum(amount) FROM sales GROUP BY 1,2;
\crosstabview region product sum
```

---

## 출력 포맷 — \pset / \x / \a

```sql
\x                    -- expanded 모드 토글 (세로 출력)
\x auto               -- 터미널 폭에 따라 자동
\a                    -- aligned ↔ unaligned 토글
\pset format csv      -- aligned | csv | html | latex | wrapped | unaligned
\pset border 2
\pset null '(null)'
\pset pager off       -- less 비활성 (로그 출력용)
\pset linestyle unicode
\pset format_footer off
\pset title '느린 쿼리 Top 10'
```

### 세션 옵션

| 명령 | 의미 |
|------|-----|
| `\timing on` | 각 쿼리 실행 시간 표시 |
| `\set AUTOCOMMIT off` | 자동 커밋 비활성 (명시적 COMMIT 필요) |
| `\set ON_ERROR_STOP on` | 스크립트 중 에러 시 즉시 중단 |
| `\set VERBOSITY verbose` | 에러 메시지 상세 |
| `\set HISTFILE ~/.psql_history-:DBNAME` | DB별 히스토리 |
| `\set HISTCONTROL ignoredups` | 중복 명령 히스토리 제외 |
| `\conninfo` | 현재 접속 정보 |
| `\encoding UTF8` | 클라이언트 인코딩 |
| `\password [user]` | 암호 변경 (해시 전송) |

---

## 변수(\set) 와 \gset

```sql
-- psql 변수 세팅
\set cutoff 30
SELECT count(*) FROM orders WHERE age_days > :cutoff;

-- 값을 따옴표로 (SQL 리터럴 방식)
\set name 'alice'
SELECT * FROM users WHERE name = :'name';

-- 식별자로 인용
\set tbl orders_2024
SELECT count(*) FROM :"tbl";

-- 쿼리 결과를 변수로
SELECT max(id) AS max_id FROM orders \gset
\echo :max_id
```

---

## 프롬프트 꾸미기 (~/.psqlrc)

```
\set QUIET 1
\pset null '(null)'
\pset linestyle unicode
\pset border 2
\set COMP_KEYWORD_CASE upper
\timing on
\set HISTFILE ~/.psql_history-:DBNAME
\set HISTCONTROL ignoredups
\set PROMPT1 '%[%033[1;32m%]%n@%/%[%033[0m%]%R%# '
\set PROMPT2 '  ... '
\set VERBOSITY verbose
\set ON_ERROR_ROLLBACK interactive
\unset QUIET
```

PROMPT1 이스케이프: `%n`=user, `%/`=db, `%M`=host, `%R`=상태(`=`,`*`,`!`), `%#`=`#`(super)/`>`(일반), `%x`=트랜잭션 상태.

---

## 세션에서 자주 쓰는 SET

```sql
-- 쿼리 타임아웃 (ms)
SET statement_timeout = '30s';
SET lock_timeout = '2s';
SET idle_in_transaction_session_timeout = '60s';

-- 검색 경로
SET search_path = myschema, public;

-- 임시로 플래너 힌트
SET enable_seqscan = off;          -- 디버깅용, 운영에는 절대 쓰지 말 것
SET work_mem = '256MB';            -- 이 세션에서만

-- 애플리케이션 이름 지정 (pg_stat_activity 에 표시)
SET application_name = 'data-migration-2025-04';

-- 트랜잭션 격리 수준
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
BEGIN; SET LOCAL work_mem = '1GB'; ... COMMIT;
```

---

## 실전 스니펫

```sql
-- 현재 활성 쿼리 Top
SELECT pid, now()-query_start AS dur, state, wait_event, left(query,80)
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY dur DESC NULLS LAST
LIMIT 20;
\watch 3

-- 인덱스 안 쓰는 것 리인덱스/드롭 후보 추출
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname NOT IN ('pg_catalog','pg_toast')
ORDER BY pg_relation_size(indexrelid) DESC;

-- 큰 테이블 Top 20
SELECT schemaname, relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS total,
       pg_size_pretty(pg_relation_size(relid))       AS heap
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

---

## 종료 / 기타

```
\?           -- 메타커맨드 전체 도움말
\h CREATE    -- SQL 문법 도움말
\h           -- SQL 명령 목록
\q           -- 종료 (Ctrl-D 동일)
```

---

## 참고

- psql reference: https://www.postgresql.org/docs/current/app-psql.html
- libpq connection strings: https://www.postgresql.org/docs/current/libpq-connect.html
- .pgpass: https://www.postgresql.org/docs/current/libpq-pgpass.html
