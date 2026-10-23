// HTML을 Markdown으로 바꿉니다. (DOCX를 읽을 때 사용)
import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";

export function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx", // "# 제목" 형식
    bulletListMarker: "-",
    codeBlockStyle: "fenced", // ``` 코드 블록
    emDelimiter: "*",
  });
  turndown.use(gfm); // 표, 취소선 지원

  // 그림은 HWP 변환과 똑같이 표시만 남깁니다. (이미지 데이터가 매우 커서)
  turndown.addRule("image", {
    filter: "img",
    replacement: () => " *(그림)* ",
  });

  return turndown.turndown(html).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
