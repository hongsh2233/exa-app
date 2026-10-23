// Markdown 글을 DOCX(Word) 파일로 만듭니다.
//
// 1. remark로 Markdown을 "구조 트리"(제목, 문단, 표 ...)로 분석합니다.
// 2. 트리의 각 부분을 docx 라이브러리의 Paragraph, Table 등으로 바꿉니다.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, PhrasingContent, List, Table as MdTable } from "mdast";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

interface TextStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
}

export async function markdownToDocx(markdown: string): Promise<Blob> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const converter = new DocxConverter();

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Malgun Gothic", size: 22 } } }, // 맑은 고딕 11pt
    },
    numbering: {
      config: [
        {
          reference: "ordered-list",
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: tree.children.flatMap((node) => converter.block(node)) }],
  });

  return Packer.toBlob(doc);
}

class DocxConverter {
  private listCount = 0; // 번호 목록마다 1부터 다시 시작하도록 구분하는 값

  /** 문단, 제목, 표 같은 "덩어리" 하나를 바꿉니다. */
  block(node: RootContent, listLevel = 0): (Paragraph | Table)[] {
    switch (node.type) {
      case "heading":
        return [new Paragraph({ heading: HEADINGS[node.depth - 1], children: this.inline(node.children) })];

      case "paragraph":
        return [new Paragraph({ children: this.inline(node.children) })];

      case "list":
        return this.list(node, listLevel);

      case "table":
        return [this.table(node), new Paragraph({})]; // 표 뒤에 빈 줄

      case "blockquote":
        // 인용문 안의 문단은 왼쪽에 선을 긋고 기울임으로 표시합니다.
        return node.children.flatMap((child) =>
          child.type === "paragraph"
            ? [
                new Paragraph({
                  indent: { left: 720 },
                  border: { left: { style: BorderStyle.SINGLE, size: 12, color: "BBBBBB", space: 8 } },
                  children: this.inline(child.children, { italics: true }),
                }),
              ]
            : this.block(child),
        );

      case "code":
        return node.value.split("\n").map(
          (line) =>
            new Paragraph({
              shading: { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" },
              children: [new TextRun({ text: line, font: "Consolas" })],
            }),
        );

      case "thematicBreak":
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } } })];

      case "html":
        return [new Paragraph({ children: [new TextRun(stripHtml(node.value))] })];

      default:
        return [];
    }
  }

  private list(node: List, level: number): Paragraph[] {
    const instance = ++this.listCount;
    return node.children.flatMap((item) =>
      item.children.flatMap((child) => {
        if (child.type === "list") return this.list(child, level + 1);
        if (child.type !== "paragraph") return this.block(child, level) as Paragraph[];
        const prefix = item.checked == null ? [] : [new TextRun(item.checked ? "☑ " : "☐ ")];
        return [
          new Paragraph({
            children: [...prefix, ...this.inline(child.children)],
            ...(node.ordered
              ? { numbering: { reference: "ordered-list", level: Math.min(level, 3), instance } }
              : { bullet: { level: Math.min(level, 3) } }),
          }),
        ];
      }),
    );
  }

  private table(node: MdTable): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: node.children.map(
        (row, rowIndex) =>
          new TableRow({
            tableHeader: rowIndex === 0,
            children: row.children.map(
              (cell) =>
                new TableCell({
                  shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: "EFF1F3", color: "auto" } : undefined,
                  children: [new Paragraph({ children: this.inline(cell.children, { bold: rowIndex === 0 }) })],
                }),
            ),
          }),
      ),
    });
  }

  /** 굵게, 기울임, 링크 같은 "문장 안" 요소를 글자 조각(TextRun)으로 바꿉니다. */
  inline(nodes: PhrasingContent[], style: TextStyle = {}): ParagraphChild[] {
    return nodes.flatMap((node): ParagraphChild[] => {
      switch (node.type) {
        case "text":
          return [run(node.value, style)];
        case "strong":
          return this.inline(node.children, { ...style, bold: true });
        case "emphasis":
          return this.inline(node.children, { ...style, italics: true });
        case "delete":
          return this.inline(node.children, { ...style, strike: true });
        case "inlineCode":
          return [run(node.value, { ...style, code: true })];
        case "break":
          return [new TextRun({ text: "", break: 1 })];
        case "link":
          return [
            new ExternalHyperlink({
              link: node.url,
              children: this.inline(node.children, style).filter((child) => child instanceof TextRun),
            }),
          ];
        case "image":
          return [run(" (그림) ", style)];
        case "html":
          // HWP 표 변환에서 쓰는 <br>은 줄바꿈으로, 나머지 태그는 지웁니다.
          return /^<br\s*\/?>$/i.test(node.value) ? [new TextRun({ text: "", break: 1 })] : [run(stripHtml(node.value), style)];
        default:
          return "children" in node ? this.inline(node.children as PhrasingContent[], style) : [];
      }
    });
  }
}

function run(text: string, style: TextStyle): TextRun {
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    font: style.code ? "Consolas" : undefined,
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
