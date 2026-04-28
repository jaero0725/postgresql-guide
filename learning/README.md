# learning — 처음 배우는 PostgreSQL

> chapters/troubleshooting을 본격적으로 읽기 전에, **운영의 절반을 결정하는 핵심 개념**을 친근한 어조로 풀어 쓴 학습 자료.

각 문서는 한 가지 큰 주제를 처음부터 끝까지 따라 읽도록 구성되어 있다. 다 읽으면 해당 영역의 정통 챕터·트러블슈팅이 쉽게 이해된다.

---

## 학습 시리즈

| # | 문서 | 내용 |
|---|------|-----|
| [01](01_update_mvcc_hot.md) | **UPDATE, MVCC, HOT, xmin/xmax** | "왜 PG는 UPDATE할수록 부푸는가"의 정확한 이해 |

---

## 학습 vs 정통 챕터

- **learning/** = "왜?"를 풀어 쓴 친근한 도입 (대화체에 가까움)
- **chapters/** = 정통 기술 설명 (필요한 모든 디테일 포함)
- **troubleshooting/** = 실제 장애 케이스 (재현·진단·해결)
- **cheatsheets/** = 빠른 참조

학습 순서 추천:
```
learning/01 (이 시리즈) → chapters/ch03 MVCC → chapters/ch08 VACUUM → troubleshooting/A1, A3
```

---

## 관련 폴더

- [../chapters/](../chapters/README.md) — 14개 정통 챕터
- [../troubleshooting/](../troubleshooting/README.md) — 27개 장애 케이스
- [../cheatsheets/](../cheatsheets/README.md) — 9개 빠른 참조
- [../examples/](../examples/README.md) — 5개 도메인 예제
