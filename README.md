# Cholab GraphPad

## 바로 실행

[Cholab GraphPad 열기](https://Park-Junjae.github.io/Cholab-graphpad/)

위 링크를 누르면 설치 없이 브라우저에서 바로 열립니다.

Cholab GraphPad는 일반 실험 데이터를 우선으로 자동 인식해 그래프를 추천하고, 필요할 때 qPCR raw data까지 분석할 수 있는 정적 웹앱입니다. 별도 설치 없이 GitHub Pages 링크를 브라우저로 열어 사용합니다.

## 빠른 시작

1. [Cholab GraphPad 열기](https://Park-Junjae.github.io/Cholab-graphpad/)를 누릅니다.
2. 기본으로 열리는 `일반 그래프` 탭에서 시작합니다. qPCR 데이터가 필요할 때만 `qPCR` 탭을 선택합니다.
3. XLSX/CSV/TSV 파일을 업로드하거나 표를 붙여넣습니다.
4. 오른쪽 `미리보기`에서 그래프를 확인합니다.
5. 필요한 경우 제목, X/Y축 이름, 그룹, 오차막대, 범례 위치, 색상 팔레트, 보조선과 기준선을 조정합니다.
6. `PNG`, `SVG`, `CSV`, `XLSX`로 저장합니다.

## 일반 그래프

일반 그래프 탭은 데이터 형태를 보고 적절한 그래프를 자동 추천합니다. 추천이 마음에 들지 않으면 그래프 버튼이나 `그래프 종류 Graph` 선택 메뉴에서 바로 바꿀 수 있습니다.

지원 그래프:

- Bar + dots
- Grouped bar
- Line
- Scatter
- Box
- Violin
- Histogram
- Heatmap
- Dose response
- Volcano

자동 추천 예시:

- `Target/Gene + Sample/Condition + Value/RE`: grouped bar
- `Time/Day/Hour + Value + Group`: line
- `Dose/Concentration + Response/Viability`: dose-response
- `log2FC + p-value/padj`: volcano
- 첫 열은 gene/sample 이름, 나머지가 여러 숫자 컬럼: 자동으로 `Series / Value` 구조로 정리한 뒤 grouped bar 또는 line
- sheet 이름에 heatmap/matrix/correlation 등이 들어간 숫자 행렬: heatmap
- 숫자형 컬럼 2개 이상: scatter
- 숫자형 컬럼 1개: histogram

## qPCR 그래프

qPCR 탭은 장비에서 export한 raw table을 받아 relative expression 그래프를 만듭니다.

지원 입력:

- Raw well-level CSV/XLSX: `Well`, `Target`, `Sample`, `Ct` 또는 `Cq`
- Ct/Cq 별칭: `Mean Ct`, `Mean Cq`, `Mean Equivalent Cq`, `Mean Adjusted Equivalent Cq`와 Ct 대응 이름
- QuantStudio `Sample Results`: `Sample Name`, `Target Name`, cycle mean 컬럼
- QuantStudio CSV의 `#` metadata 줄과 trailing empty column 자동 처리

QuantStudio `Sample Results`의 `-B1`, `-B2`, `-B3` suffix는 biological replicate로 사용합니다. Technical replicate는 cycle mean에 이미 요약된 것으로 처리합니다. `Biogroup Results`는 QuantStudio가 계산한 `Rq`, `Rq Min`, `Rq Max`를 aggregate 그래프로 표시하지만, replicate가 이미 합쳐진 summary이므로 biological replicate dot이나 SD/SEM 계산에는 사용할 수 없습니다.

qPCR Figure 설정에서 Y축 최소값과 최대값을 직접 지정할 수 있습니다. 두 값을 비우면 자동 범위로 돌아갑니다. Biogroup Results의 장비 신뢰구간이 지나치게 넓을 때는 오차막대를 `없음`으로 바꿔 Rq 막대만 확인할 수 있습니다.

계산은 comparative Cq 방식인 `2^-ΔΔCq`를 사용합니다. 이 방식은 target/reference assay의 증폭 효율이 충분히 유사하다는 가정이 필요합니다. 효율 차이가 큰 assay에는 efficiency-corrected 분석을 사용해야 합니다.

- Livak & Schmittgen, 2001: <https://pubmed.ncbi.nlm.nih.gov/11846609/>
- MIQE guidelines: <https://pubmed.ncbi.nlm.nih.gov/19246619/>

기본 컬럼 예시:

```text
Well    Target    Sample    Cq
A1      GAPDH     Control_1  18.3
A2      ACTB      Control_1  19.1
A3      IL6       Control_1  26.4
```

사용 순서:

1. `qPCR` 탭에서 파일을 업로드하거나 표를 붙여넣습니다.
2. `Reference gene 기준 유전자`에서 GAPDH, ACTB 같은 housekeeping gene을 선택합니다.
3. `Calibrator 기준 샘플`에서 Control, WT 등 기준 샘플을 선택합니다.
4. BioRep/TechRep 구조와 `오차막대 Error bar`를 선택합니다.
5. `분석`을 누릅니다.

## 수동 조정

- `X`, `Y`, `Group`, `Label`: 컬럼을 직접 지정합니다.
- `그룹 기준`: 자주 바꾸는 Group 컬럼을 빠르게 선택합니다.
- `X/Y 바꾸기`: 숫자형 축을 서로 바꿉니다.
- `제목 Title`, `X축 이름`, `Y축 이름`: 그래프에 표시될 이름을 직접 입력합니다.
- `오차막대 Error bar`: SEM, SD, 95% CI, 없음 중에서 선택합니다.
- `X값 변환`, `Y값 변환`: log10, log2, ln, sqrt, z-score, percent 변환을 적용합니다.
- `범례 위치 Legend`: Right, Top, Bottom, Left, Floating, Hide 중에서 선택합니다.

## Figure 스타일

- `Default`: 논문/발표용 기본 스타일을 유지하면서 그래프 종류, 축, 범례, 색상 팔레트만 빠르게 조정합니다.
- `Advanced`: figure width/height, 폰트, 제목/축/눈금 글자 크기, 여백, 축선, 보조선, 막대 투명도와 테두리, 선 두께, 점 크기와 색, replicate dot 스타일, 오차막대 색과 두께, 기준선 스타일을 직접 조정합니다.
- 오른쪽 `미리보기`는 스크롤을 내려도 따라오며, Rows/Plotted/Groups/Graph와 QC 메시지가 미리보기 안에 같이 표시됩니다.

## 보조선과 기준선

- `축과 범례 Axes`의 `가로 보조선`: Y축 방향의 내부 보조선을 켜거나 끕니다.
- `축과 범례 Axes`의 `세로 보조선`: X축 방향의 내부 보조선을 켜거나 끕니다.
- `축과 범례 Axes`의 `기준선`: cutoff, baseline, threshold처럼 강조할 값을 가로선 또는 세로선으로 추가합니다.
- `축과 범례 Axes`의 `기준선 라벨`: 추가한 기준선 이름을 직접 입력합니다.
- `축과 범례 Axes`의 `기준선 라벨 표시`: 기준선 라벨을 한 번에 보이거나 숨깁니다.
- `축과 범례 Axes`의 `기준선 목록`에서 기준선을 선택하고 `삭제`를 누르면 해당 기준선이 제거됩니다.

## 저장 형식

- `PNG`: 이미지 파일로 저장
- `SVG`: Illustrator 등에서 편집하기 좋은 벡터 파일
- `CSV`: 그래프에 사용된 표 데이터
- `XLSX`: summary, 계산 상세, warning note가 포함된 엑셀 파일

Plotly와 SheetJS는 버전이 고정된 CDN 파일을 사용합니다. GitHub Pages 링크를 열면 별도 설치 없이 그래프와 엑셀 업로드 기능을 사용할 수 있지만 인터넷 연결은 필요합니다.

## 개발과 배포 파일 생성

유지보수 원본은 `src/`에 있습니다. `src/index.html`과 `src/qpcr-core.js`를 수정한 뒤 아래 명령으로 테스트와 GitHub Pages용 payload를 생성합니다.

```bash
npm test
npm run build
```

`npm run build`는 `src/index.html`을 gzip/Base64 payload로 만들고 `index.html`, `qpcr-core.js`, `payload/chunk-*.js`를 갱신합니다. 생성된 payload를 직접 수정하지 마세요.
