// DOCX(Word 2007 이후) 파일을 Markdown으로 바꿉니다.
// mammoth 라이브러리로 DOCX → HTML로 바꾼 뒤, HTML → Markdown으로 한 번 더 바꿉니다.
import mammoth from "mammoth";
import { htmlToMarkdown } from "./htmlToMarkdown";

export async function docxToMarkdown(data: ArrayBuffer): Promise<string> {
  // 브라우저용 mammoth는 arrayBuffer, Node.js용은 buffer라는 이름을 씁니다. 둘 다 넘깁니다.
  const input = { arrayBuffer: data, buffer: data } as unknown as { arrayBuffer: ArrayBuffer };

  try {
    const { value: html } = await mammoth.convertToHtml(input);
    return htmlToMarkdown(html);
  } catch {
    throw new Error("DOCX 파일을 열 수 없습니다. 파일이 손상되었거나 DOCX 형식이 아닙니다.");
  }
}
