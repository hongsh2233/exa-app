# 서식 유지 변환 서버

LibreOffice와 [H2Orestart](https://github.com/ebandal/H2Orestart)(HWP 확장)로 문서를 **원본 서식 그대로** 변환하는 서버입니다.
편집기(Vercel)의 "서식 유지 변환" 메뉴가 이 서버를 사용하고, 내부 서비스에서도 같은 API를 호출할 수 있습니다.

| 받을 수 있는 파일 | 만들 수 있는 파일 |
| --- | --- |
| HWP, HWPX, DOC, DOCX, ODT, RTF | PDF, DOCX, DOC, ODT |

## API

### `POST /convert?to=pdf`

- 본문: 파일 내용 그대로 (multipart가 아닙니다)
- 헤더 `X-File-Name`: 원래 파일 이름 (URL 인코딩). 확장자로 파일 형식을 판단합니다.
- 헤더 `Authorization: Bearer <키>`: 서버에 `API_KEY`를 설정한 경우에만 필요
- 응답: 변환된 파일 (`Content-Disposition`에 파일 이름 포함)

```bash
curl -X POST "https://<서버 주소>/convert?to=pdf" \
  -H "X-File-Name: report.hwp" \
  --data-binary @report.hwp \
  -o report.pdf
```

```js
// JavaScript (브라우저, Node.js 18 이상)
const response = await fetch(`${SERVER}/convert?to=docx`, {
  method: "POST",
  headers: { "X-File-Name": encodeURIComponent(file.name) },
  body: file,
});
if (!response.ok) throw new Error((await response.json()).error);
const blob = await response.blob();
```

오류 응답은 `{ "error": "한글 설명" }` 형식입니다.

| 상태 코드 | 뜻 |
| --- | --- |
| 400 | 지원하지 않는 형식, 파일 이름 없음 |
| 401 | API 키가 틀림 |
| 413 | 파일이 너무 큼 |
| 422 | 올바른 문서 파일이 아니거나 변환 실패 (손상, 암호) |
| 504 | 변환 시간 초과 |

### `GET /health`

서버 상태와 지원 형식을 돌려줍니다.

## 설정 (환경 변수)

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `10000` | 서버 포트 (Render가 자동으로 넣어 줍니다) |
| `ALLOWED_ORIGINS` | `*` | 이 서버를 부를 수 있는 웹사이트 주소 (쉼표로 여러 개) |
| `API_KEY` | 없음 | 설정하면 `Authorization` 헤더가 필요합니다. 내부 서비스 전용 서버에 사용하세요. |
| `MAX_FILE_MB` | `20` | 최대 파일 크기 |
| `TIMEOUT_SECONDS` | `120` | 변환 하나의 최대 시간 |

`API_KEY`는 브라우저 코드에 넣으면 누구나 볼 수 있습니다. 공개 편집기용 서버에는 `ALLOWED_ORIGINS`만 쓰고,
내부 서비스용으로는 `API_KEY`를 설정한 서버를 따로 하나 더 띄우는 것을 추천합니다.

## Render에 배포하기

1. https://dashboard.render.com 에서 **New → Blueprint**를 누릅니다.
2. `exa-app` 저장소를 고르면 저장소의 `render.yaml` 설정대로 `exa-convert` 서버가 만들어집니다.
3. 배포가 끝나면 `https://exa-convert-xxxx.onrender.com` 같은 주소가 나옵니다.
4. Vercel의 exa-app 프로젝트 → **Settings → Environment Variables**에
   `NEXT_PUBLIC_CONVERT_API_URL` = 위 서버 주소를 넣고 다시 배포하면 편집기에 "서식 유지 변환" 버튼이 나타납니다.

무료 플랜은 15분 동안 요청이 없으면 잠들고, 다음 첫 요청에서 깨어나는 데 30초~1분이 걸립니다.

## 내 컴퓨터에서 실행하기

```bash
cd server
docker build -t exa-convert .
docker run --rm -p 10000:10000 exa-convert
```

## 라이선스

이 서버 코드는 MIT입니다. Docker 이미지를 만들 때 내려받는 H2Orestart는 GPL-3.0이며,
저장소에는 포함하지 않고 별도 프로그램으로 실행만 합니다.
