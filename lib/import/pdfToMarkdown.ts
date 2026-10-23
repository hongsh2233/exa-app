// PDF 파일에서 글자를 꺼내 Markdown 문단으로 바꿉니다.
//
// PDF에는 "문단"이나 "표" 정보가 없고, 글자 조각과 그 위치만 있습니다.
// 그래서 줄 사이 간격이 넓으면 새 문단으로 나누는 방식으로 정리합니다.
// 스캔한 이미지 PDF는 글자 데이터가 없어서 변환되지 않습니다.

interface Line {
  text: string;
  x: number; // 줄이 시작하는 가로 위치
  right: number; // 줄이 끝나는 가로 위치
  y: number; // 세로 위치 (클수록 페이지 위쪽)
  height: number; // 글자 높이
}

const BULLET = /^[•·▪◦●○■□\-–]\s*/;
const NUMBERED = /^\d+[.)]\s/;

export async function pdfToMarkdown(data: ArrayBuffer): Promise<{ markdown: string; pageCount: number }> {
  // pdf.js는 크기가 커서 PDF를 열 때만 불러옵니다.
  // legacy 빌드는 최신 기능이 없는 브라우저용 대체 코드가 들어 있어서 더 많은 브라우저에서 동작합니다.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw new Error("암호가 걸린 PDF는 변환할 수 없습니다.");
    }
    throw new Error("PDF 파일을 열 수 없습니다. 파일이 손상되었거나 PDF 형식이 아닙니다.");
  }

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    // 1. 글자 조각을 줄 단위로 모읍니다. 세로 위치가 바뀌면 새 줄입니다.
    const lines: Line[] = [];
    let current: Line | null = null;
    for (const item of content.items) {
      if (!("str" in item) || (!item.str.trim() && !current)) continue;
      const [x, y] = [item.transform[4], item.transform[5]];
      const height = item.height || 10;
      if (!current || Math.abs(current.y - y) > Math.max(current.height, height) * 0.5) {
        if (current) lines.push(current);
        current = { text: "", x, right: x, y, height };
      }
      // 앞 조각과 떨어져 있으면 띄어쓰기를 넣습니다. (굵게/기울임 경계에서 공백이 빠지는 경우)
      const separated = x - current.right > height * 0.15;
      if (separated && current.text && !/\s$/.test(current.text) && !/^\s/.test(item.str)) current.text += " ";
      current.text += item.str;
      current.right = Math.max(current.right, x + item.width);
      current.height = Math.max(current.height, height);
    }
    if (current) lines.push(current);

    // 2. 줄을 문단으로 묶습니다. 아래 경우에는 새 문단을 시작합니다.
    //    - 줄 간격이 넓을 때 / 글자 크기가 달라질 때(제목) / 앞줄이 짧게 끝났을 때 / 목록 기호로 시작할 때
    const pageLeft = Math.min(...lines.map((line) => line.x));
    const pageRight = Math.max(...lines.map((line) => line.right));
    const paragraphs: string[] = [];
    let paragraph = "";

    lines.forEach((line, index) => {
      let text = line.text.trim();
      if (!text) return;
      const previous = lines[index - 1];
      const isListItem = BULLET.test(text) || NUMBERED.test(text);
      const startsNew =
        !previous ||
        previous.y - line.y > previous.height * 1.8 ||
        previous.y < line.y || // 위로 올라감 = 다음 단(column)
        Math.abs(previous.height - line.height) > line.height * 0.2 ||
        previous.right < pageLeft + (pageRight - pageLeft) * 0.8 ||
        isListItem;

      if (BULLET.test(text)) text = "- " + text.replace(BULLET, "");
      if (paragraph && startsNew) {
        paragraphs.push(paragraph);
        paragraph = "";
      }
      paragraph += (paragraph ? " " : "") + text;
    });
    if (paragraph) paragraphs.push(paragraph);

    pages.push(paragraphs.join("\n\n"));
  }

  const markdown = pages.filter(Boolean).join("\n\n---\n\n"); // 쪽 사이에는 구분선
  if (!markdown.trim()) {
    throw new Error("PDF에서 글자를 찾지 못했습니다. 스캔한 이미지 PDF는 변환할 수 없습니다.");
  }
  return { markdown: markdown + "\n", pageCount: pdf.numPages };
}
