// 미리보기 HTML을 DOC 파일로 만듭니다.
//
// Word 97~2003의 진짜 DOC(바이너리) 형식은 브라우저에서 만들기 매우 어렵습니다.
// 대신 Word 전용 정보를 붙인 HTML을 .doc 이름으로 저장하면 Word, 한글, LibreOffice가 열 수 있습니다.
// (Word에서 열 때 "파일 형식이 다르다"는 안내가 나올 수 있습니다. "예"를 누르면 열립니다.)

export function htmlToDoc(bodyHtml: string, title: string): Blob {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: "맑은 고딕", "Malgun Gothic", sans-serif; font-size: 11pt; line-height: 1.6; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4pt 8pt; vertical-align: top; }
  th { background: #eff1f3; }
  pre, code { font-family: Consolas, monospace; background: #f2f2f2; }
  blockquote { margin-left: 12pt; padding-left: 8pt; border-left: 3pt solid #bbb; color: #555; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;

  // 맨 앞의 BOM(﻿)은 Word가 UTF-8 한글을 바르게 읽도록 돕습니다.
  return new Blob(["﻿", html], { type: "application/msword" });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}
