# exa-app 프로그램 구조

> **최종 업데이트** 2026-10-26
> **스택** Next.js 15 (App Router) · React 19 · TypeScript 5 · LibreOffice 변환 서버(Docker)
>
> 코드 구조가 바뀌면 이 문서를 함께 고친다. 작업 이력은 `docs/HISTORY.md` 참고.

---

## 1. 전체 구성

```
[사용자 브라우저]
  └─ 편집기 (Vercel, https://exa-app-xi.vercel.app/)
       ├─ 열기 / 일괄 MD 변환 / 저장  → 모두 브라우저 안에서 변환 (파일이 서버로 가지 않음)
       └─ 서식 유지 변환 ──HTTP──▶ [변환 서버 exa-convert (Render, Docker)]
                                      LibreOffice + H2Orestart → PDF / DOCX / DOC / ODT
```

| 구성 | 위치 | 배포 | 하는 일 |
| --- | --- | --- | --- |
| 편집기 | `app/`, `lib/` | Vercel (main 브랜치 자동 배포) | 문서 → Markdown 변환, 편집, 저장 |
| 변환 서버 | `server/`, `render.yaml` | Render Blueprint (`server/**`가 바뀔 때만 다시 배포) | 원본 서식 그대로 형식 변환 |

DB와 로그인은 없다. 편집 중인 글은 브라우저 `localStorage`(`hwp-md-editor:document`)에만 저장된다.

---

## 2. 화면 (`app/`)

| 파일 | 역할 |
| --- | --- |
| `page.tsx` | 편집기 화면 전체: 도구 모음, 편집/미리보기, 끌어다 놓기, 자동 저장, 저장 형식 선택, 인쇄 영역 |
| `BatchConvertDialog.tsx` | "일괄 MD 변환" 창: 여러 파일 선택 → 파일별 결과 표시 → ZIP 저장 |
| `FormatConvertDialog.tsx` | "서식 유지 변환" 창: 변환 서버로 파일 전송 → 결과 파일 저장 |
| `layout.tsx` | HTML 기본 틀 |
| `globals.css` | 디자인 (다크 모드, 휴대폰 화면, 인쇄 화면, 창 스타일) |

끌어다 놓기: 파일 1개 → 편집기에서 열기, 여러 개 → 일괄 MD 변환 창.

---

## 3. 변환 흐름 (`lib/`)

### 가져오기 (문서 → Markdown)

```
importFile(file)                       lib/import/importFile.ts  (확장자로 변환기 선택, 필요할 때만 불러옴)
  ├─ .hwp        → hwpToMarkdown       lib/hwp/hwpToMarkdown.ts  (+ records.ts: HWP 레코드 읽기, cfb + pako)
  ├─ .docx       → docxToMarkdown      lib/import/docxToMarkdown.ts  (mammoth → HTML → htmlToMarkdown)
  ├─ .doc        → docToMarkdown       lib/import/docToMarkdown.ts   (Word 97-2003 직접 해석)
  ├─ .pdf        → pdfToMarkdown       lib/import/pdfToMarkdown.ts   (pdf.js legacy, 글자만)
  └─ .md/.txt    → 그대로

batchToMarkdown(files)                 lib/import/batchToMarkdown.ts
  └─ 파일마다 importFile → 이름 중복 정리(uniqueMdName) → fflate로 ZIP 묶기 (실패한 파일은 건너뜀)
```

| 형식 | 가져오는 내용 | 못 가져오는 것 |
| --- | --- | --- |
| HWP 5.0 | 문단, 제목(개요 1~6), 표, 그림 위치 | HWP 3.0/97, HWPX, 암호·배포용 |
| DOCX | 문단, 제목, 굵게/기울임, 목록, 표, 링크, 그림 위치 | |
| DOC | 문단, 표, 필드 결과 | 제목 스타일, 글자 서식, Word 95 이하 |
| PDF | 글자, 문단, 목록 | 표 구조, 스캔 이미지 |

그림은 모든 형식에서 `*(그림)*` 표시만 남긴다.

### 저장 (Markdown → 파일)

| 형식 | 파일 | 방식 |
| --- | --- | --- |
| MD | `page.tsx` | 글 그대로 |
| DOCX | `lib/export/markdownToDocx.ts` | remark로 Markdown 해석 → docx 라이브러리 (표 첫 줄만 제목 줄) |
| DOC | `lib/export/htmlToDoc.ts` | 미리보기 HTML을 Word가 여는 .doc로 |
| PDF | `page.tsx` | 브라우저 인쇄 → "PDF로 저장" |

모든 다운로드는 `lib/export/download.ts`의 `downloadBlob` 하나로 처리한다.

---

## 4. 변환 서버 (`server/`)

| 항목 | 내용 |
| --- | --- |
| API | `POST /convert?to=pdf\|docx\|doc\|odt` (본문 = 파일, 헤더 `X-File-Name`), `GET /health` |
| 받는 형식 | HWP, HWPX, DOC, DOCX, ODT, RTF |
| 환경 변수 | `ALLOWED_ORIGINS`(허용 웹 주소), `MAX_FILE_MB`(20), `TIMEOUT_SECONDS`(120), `API_KEY`(선택, `Authorization: Bearer`) |
| 사용처 | 이 편집기, HighFive 업무 첨부 변환(`CONVERT_API_URL`/`CONVERT_API_KEY`) |

자세한 API는 `server/README.md`.

---

## 5. 환경 변수와 배포

| 변수 | 위치 | 뜻 |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVERT_API_URL` | Vercel | 변환 서버 주소. 없으면 "서식 유지 변환" 버튼이 숨겨진다 |

- main에 병합하면 Vercel이 자동 배포한다.
- 변환 서버는 Render 무료 플랜이라 한동안 안 쓰면 잠들고, 첫 변환은 1분 정도 걸릴 수 있다.

---

## 6. 확인 방법

| 명령 | 내용 |
| --- | --- |
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm run build` | 배포 전 빌드·타입 검사 |
| `npm test` | `samples/`의 .hwp/.docx/.doc를 .md로 변환해 결과 확인 (`samples/`는 저장소에 없음) |
