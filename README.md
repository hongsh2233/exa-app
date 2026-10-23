# HWP → MD 편집기

HWP 5.0 문서(`.hwp`)를 Markdown으로 바꾸고, 바로 편집해서 `.md` 파일로 저장하는 Next.js 웹 앱입니다.

## 실행 방법

```bash
npm install     # 처음 한 번만
npm run dev     # 개발 서버 실행 → http://localhost:3000
npm test        # samples 폴더의 .hwp를 .md로 변환해 보기
```

## 기능

- `.hwp`(HWP 5.0, 2002년 이후 버전) 파일을 열면 Markdown으로 자동 변환
- `.md` 파일 열기와 저장 (Ctrl+S)
- 서식 버튼: 제목, 굵게, 기울임, 목록, 링크, 표
- 화면 모드: 편집 / 나란히 / 미리보기
- 파일을 화면에 끌어다 놓아서 열기
- 브라우저에 자동 저장
- 변환은 **브라우저 안에서만** 일어나서 파일이 서버로 전송되지 않음

## HWP 변환 규칙

| HWP | Markdown |
| --- | --- |
| 일반 문단 | 문단 (빈 줄로 구분) |
| "개요 1"~"개요 6" 스타일 | `#` ~ `######` 제목 |
| 표 | GFM 표 (첫 줄이 제목 줄, 병합된 칸은 빈칸) |
| 표 안의 표 | `칸 / 칸` 형태의 글자 |
| 그림 | `*(그림)*` 표시 |
| 머리말, 꼬리말, 쪽 번호 | 생략 |

지원하지 않는 파일: HWP 3.0/97 이하, HWPX, 암호 문서, 배포용 문서 (알림 메시지가 나옵니다)

## 폴더 구조

```
app/
  page.tsx          편집기 화면 (React)
  layout.tsx        HTML 기본 틀
  globals.css       디자인 (다크 모드, 휴대폰 화면 포함)
lib/hwp/
  records.ts        HWP 레코드(데이터 조각) 읽기
  hwpToMarkdown.ts  HWP → Markdown 변환
scripts/
  test-convert.ts   변환 테스트 스크립트
samples/            테스트용 HWP 파일을 넣는 폴더 (저장소에는 미포함)
```

## 참고 자료

- 한글과컴퓨터 "한글 문서 파일 형식 5.0" 공개 스펙
- [hwp.js](https://github.com/hahnlee/hwp.js): JavaScript로 만든 HWP 뷰어

## 라이선스

[MIT](LICENSE)
