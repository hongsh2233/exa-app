# 작업 히스토리

> 작업을 마치면 맨 위에 날짜별로 기록을 추가한다. 구조가 바뀌면 `docs/PROJECT_STRUCTURE.md`도 함께 고친다.

## 2026-10-26

- 일괄 MD 변환: 도구 모음 "일괄 MD 변환" 버튼(`app/BatchConvertDialog.tsx`). 여러 파일(HWP/DOCX/DOC/PDF/MD/TXT)을 골라 한 번에 Markdown으로 바꾸고 `MD 변환_YYYYMMDD.zip` 하나로 저장. 화면에 여러 파일을 끌어다 놓아도 이 창이 열림(하나면 기존처럼 편집기에서 열기). 파일별 진행·결과(성공한 .md 이름 / 실패 이유) 표시, 실패한 파일은 건너뛰고 나머지는 계속 변환. 같은 이름은 `보고서 (2).md`처럼 번호를 붙임. 변환은 기존 `importFile`을 그대로 써서 브라우저 안에서만 수행(서버 전송 없음). 편집 중인 문서는 바뀌지 않음.
- `lib/import/batchToMarkdown.ts` 추가, 의존성 `fflate`(ZIP 생성) 추가.
- 버그 수정: Word(.docx) 저장 시 표의 둘째 줄부터 `tblHeader w:val="off"`가 들어가, 이 파일을 다시 MD로 가져오면 모든 줄을 제목 줄로 읽어 줄마다 구분선(`| --- |`)이 생기던 문제. 첫 줄에만 제목 줄 표시를 넣도록 수정(`lib/export/markdownToDocx.ts`).
- 문서 추가: `docs/HISTORY.md`(이 문서), `docs/PROJECT_STRUCTURE.md`(프로그램 구조).

## 2026-10-23

- 서식 유지 변환 서버 추가(#3): `server/`(Node + LibreOffice + H2Orestart, Docker), `render.yaml`(Render 무료 플랜, 싱가포르). `POST /convert?to=pdf|docx|doc|odt`, 선택 `API_KEY`, `ALLOWED_ORIGINS`, 최대 20MB·120초. 편집기에 "서식 유지 변환" 창(`app/FormatConvertDialog.tsx`) — `NEXT_PUBLIC_CONVERT_API_URL`이 있을 때만 버튼 표시.
- DOCX, DOC, PDF 열기와 저장 형식 선택(#2): DOCX(mammoth + turndown), DOC(Word 97-2003 조각 표 직접 해석), PDF(pdf.js legacy 빌드, 글자만) 가져오기. 저장은 MD / DOCX(docx 라이브러리) / DOC(HTML 기반) / PDF(브라우저 인쇄) 중 선택. 오래된 브라우저 대응으로 pdf.js legacy 빌드 사용, DOC의 windows-1252 문자 표, 잘못된 파일 형식 검사 추가.
- MD 저장 다운로드 안정화: 다운로드 직후 주소를 지우면 파일 이름이 사라지던 문제 수정(1초 뒤 정리).
- 첫 버전: HWP 5.0 → Markdown 변환 편집기(Next.js 15). HWP 레코드 직접 해석(CFB + zlib), 문단·제목(개요 1~6)·표·그림 위치 변환, 편집/나란히/미리보기, 서식 버튼, 브라우저 자동 저장, 끌어다 놓기로 열기. Vercel 배포(https://exa-app-xi.vercel.app/).
