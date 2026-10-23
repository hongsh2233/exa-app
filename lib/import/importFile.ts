// 파일 확장자를 보고 알맞은 변환기를 고릅니다.
// 변환기는 필요할 때만 불러와서(동적 import) 첫 화면이 빨리 열리게 합니다.

export interface ImportResult {
  markdown: string;
  message: string; // 상태 표시줄에 보여줄 문구
}

export const ACCEPTED_FILES = ".hwp,.docx,.doc,.pdf,.md,.markdown,.txt";

export async function importFile(file: File): Promise<ImportResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const data = await file.arrayBuffer();

  switch (extension) {
    case "hwp": {
      const { hwpToMarkdown } = await import("@/lib/hwp/hwpToMarkdown");
      const result = hwpToMarkdown(new Uint8Array(data));
      return {
        markdown: result.markdown,
        message: `HWP ${result.version} 문서를 변환했습니다 (섹션 ${result.sectionCount}개)`,
      };
    }
    case "docx": {
      const { docxToMarkdown } = await import("./docxToMarkdown");
      return { markdown: await docxToMarkdown(data), message: "DOCX 문서를 변환했습니다" };
    }
    case "doc": {
      const { docToMarkdown } = await import("./docToMarkdown");
      return { markdown: docToMarkdown(new Uint8Array(data)), message: "DOC 문서를 변환했습니다 (글자와 표만)" };
    }
    case "pdf": {
      const { pdfToMarkdown } = await import("./pdfToMarkdown");
      const result = await pdfToMarkdown(data);
      return { markdown: result.markdown, message: `PDF ${result.pageCount}쪽을 변환했습니다 (글자만)` };
    }
    case "md":
    case "markdown":
    case "txt":
      return { markdown: new TextDecoder().decode(data), message: `${file.name} 파일을 열었습니다` };
    default:
      throw new Error(`지원하지 않는 파일입니다. (${ACCEPTED_FILES.replaceAll(",", " ")})`);
  }
}
