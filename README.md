# AI 모델 지도 (AI Model Map)

미국·중국 주요 AI 모델을 **업체별·작업별**로 비교하는 정적 사이트입니다.
GitHub Pages에서 돌아가고, 모델 데이터는 매일 자동으로 갱신됩니다.

## 구성

| 경로 | 역할 |
|---|---|
| `index.html` | 사이트 전체 (탭 4개: 작업별 추천 / 업체별 / 전체 비교 / 업데이트) |
| `scripts/build_data.js` | models.dev + OpenRouter 공개 API에서 데이터 수집 → `data/models.json` |
| `notes/curation.json` | 한국어 설명·추천 작업 큐레이션 (사람이 관리) |
| `data/models.json` | 사이트가 읽는 데이터 (자동 생성) |
| `data/updates.json` | 새로 추가된 모델 이력 (자동 생성) |
| `.github/workflows/update.yml` | 매일 06:00 KST 자동 갱신 + 수동 실행 |

## 데이터 갱신 방식

1. GitHub Actions가 매일 `node scripts/build_data.js` 실행
2. models.dev에서 모델명·출시일·가격·컨텍스트·능력·오픈웨이트 수집
3. OpenRouter에서 컨텍스트/가격 보조 확인
4. `notes/curation.json`의 한국어 설명을 모델 ID로 붙임
5. `data/`를 커밋 → 사이트에 자동 반영

새 모델은 자동으로 목록에 추가되고 **NEW** 표시가 붙습니다.
한국어 설명이 없는 모델은 "설명 준비 중"으로 표시되며, `notes/curation.json`에
항목을 추가하면 다음 갱신 때 반영됩니다.

```json
"provider/model-id": {
  "ko": "한 줄 설명",
  "strengths": ["강점1", "강점2"],
  "tasks": ["coding", "agent"],
  "caution": "주의할 점",
  "tier": "flagship | mid | light",
  "pick": true
}
```

`tasks` 값: `coding`, `agent`, `writing`, `research`, `long`, `vision`, `cheap`

## 수동으로 데이터 갱신

```bash
node scripts/build_data.js
```

## 로컬 확인

`index.html`을 그냥 열면 `fetch`가 막히므로 로컬 서버로 확인합니다.

```bash
npx serve .
```
## 5탭: 가성비 지도 (2026-11-10 추가)

- Finviz Map 스타일 트리맵. 대분류 10개(코딩·개발 / AI 에이전트 / 문서·보고서 / 리서치·분석 / 긴 문서·RAG / 이미지·영상 생성 / 음성·오디오 / 이미지·PDF 이해 / 오픈소스·자체 호스팅 / 대량·저비용 처리)
- 각 분류 아래에 사용자용 예시 문구 표시
- 타일 크기 = 종합 등급(큐레이션 3단계 + 컨텍스트 + 지원 기능), 색 = 실효단가 5단계
- 비용 기준 3가지: 문서 요약형(4:1) / 일반 대화(1:1) / 창작·생성형(1:3)
- 타일 호버 툴팁, 클릭 시 상세, 리사이즈 시 자동 재배치

## 데이터 소스 추가 (2026-11-10)
- OpenRouter Rankings(https://openrouter.ai/rankings)에서 주간 실사용 토큰량을 수집해 models.json의 pop/pop_rank/pop_chg로 저장
- 순위 기준 4번째 버튼 '인기(실사용량)'로 사용
- 표가 여러 개(이번주/지난주/전체)라 이름 기준 첫 등장만 사용, 별칭 표(OR_ALIAS)로 모델명 매칭
## 작업별 실사용 지출 (2026-11-10)
- OpenRouter /api/frontend/v1/rankings/task-spend 에서 30일 지출 비중 수집
- 18개 세부 태그를 우리 5개 작업(coding/agent/research/writing/cheap)으로 매핑·정규화
- 작업 카드에 '실제 지출 1위' 배너 + 모델별 '실사용 %' 배지
