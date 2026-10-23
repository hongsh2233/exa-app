# HWP → MD 편집기

HWP, DOCX, DOC, PDF 문서를 Markdown으로 바꿔서 편집하고, MD / DOCX / DOC / PDF로 저장하는 Next.js 웹 앱입니다.

## 실행 방법

```bash
npm install     # 처음 한 번만
npm run dev     # 개발 서버 실행 → http://localhost:3000
npm test        # samples 폴더의 .hwp / .docx / .doc를 .md로 변환해 보기
```

## 기능

- **열기**: `.hwp`(HWP 5.0), `.docx`, `.doc`, `.pdf`, `.md` 파일을 Markdown으로 변환
- **저장**: Markdown(.md), Word(.docx), Word 97-2003(.doc), PDF 중 선택 (Ctrl+S)
- 서식 버튼: 제목, 굵게, 기울임, 목록, 링크, 표
- 화면 모드: 편집 / 나란히 / 미리보기
- 파일을 화면에 끌어다 놓아서 열기
- 브라우저에 자동 저장
- 변환은 **브라우저 안에서만** 일어나서 파일이 서버로 전송되지 않음

## 열기: 형식별 변환 범위

| 형식 | 가져오는 내용 | 참고 |
| --- | --- | --- |
| HWP 5.0 | 문단, 제목("개요 1~6" 스타일), 표, 그림 위치 | HWP 3.0/97, HWPX, 암호·배포용 문서는 미지원 |
| DOCX | 문단, 제목, 굵게/기울임, 목록, 표, 링크, 그림 위치 | |
| DOC (Word 97~2003) | 문단, 표, 필드 결과 | 제목 스타일과 글자 서식은 미지원, Word 95 이하 미지원 |
| PDF | 글자, 문단, 목록 | 표 구조는 글자로 이어짐, 스캔한 이미지 PDF는 미지원 |

그림은 모든 형식에서 `*(그림)*` 표시만 남깁니다.

## 저장: 형식별 방식

| 형식 | 방식 |
| --- | --- |
| MD | 편집 중인 글 그대로 |
| DOCX | 제목, 굵게/기울임, 목록, 표, 링크, 인용문, 코드를 Word 서식으로 변환 |
| DOC | Word가 열 수 있는 HTML 기반 `.doc` 파일 (Word에서 "형식이 다르다"는 안내가 나오면 "예"를 누르세요) |
| PDF | 브라우저 인쇄 창이 열리면 대상을 **"PDF로 저장"**으로 선택 (한글 글꼴이 깨지지 않고 글자 선택 가능) |

## 서식 유지 변환 (변환 서버)

편집기의 변환은 Markdown을 거치기 때문에 글꼴, 색, 정렬 같은 서식이 사라집니다.
원본 모양 그대로 HWP → PDF/DOCX 등으로 바꾸려면 [변환 서버](server/README.md)(LibreOffice + H2Orestart)를 함께 배포하세요.
Vercel 환경 변수 `NEXT_PUBLIC_CONVERT_API_URL`에 서버 주소를 넣으면 도구 모음에 **서식 유지 변환** 버튼이 나타납니다.

## 폴더 구조

```
app/
  page.tsx                편집기 화면 (React)
  FormatConvertDialog.tsx "서식 유지 변환" 창
  layout.tsx              HTML 기본 틀
  globals.css             디자인 (다크 모드, 휴대폰 화면, 인쇄 포함)
lib/hwp/
  records.ts              HWP 레코드(데이터 조각) 읽기
  hwpToMarkdown.ts        HWP → Markdown
lib/import/
  importFile.ts           확장자에 맞는 변환기 고르기
  docxToMarkdown.ts       DOCX → Markdown (mammoth + turndown)
  docToMarkdown.ts        DOC → Markdown (직접 구현)
  pdfToMarkdown.ts        PDF → Markdown (pdf.js)
  htmlToMarkdown.ts       HTML → Markdown
lib/export/
  markdownToDocx.ts       Markdown → DOCX (docx)
  htmlToDoc.ts            HTML → DOC
  download.ts             파일 내려받기
server/                   서식 유지 변환 서버 (Docker, Render 배포용)
render.yaml               Render 배포 설정
scripts/
  test-convert.ts         변환 테스트 스크립트
samples/                  테스트용 문서를 넣는 폴더 (저장소에는 미포함)
```

## 참고 자료

- 한글과컴퓨터 "한글 문서 파일 형식 5.0" 공개 스펙
- Microsoft "[MS-DOC]: Word (.doc) Binary File Format" 공개 스펙
- [hwp.js](https://github.com/hahnlee/hwp.js): JavaScript로 만든 HWP 뷰어

## 라이선스

[MIT](LICENSE)
