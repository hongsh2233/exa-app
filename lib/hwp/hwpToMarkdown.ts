// HWP 5.0 파일을 Markdown 글로 바꾸는 코드입니다.
//
// 전체 흐름
//   1. HWP 파일은 "CFB(복합 파일)"라는 압축 폴더 같은 형식입니다. cfb 라이브러리로 엽니다.
//   2. FileHeader에서 버전, 압축 여부, 암호 여부를 확인합니다.
//   3. DocInfo에서 스타일 이름을 읽습니다. "개요 1" 스타일은 제목(#)으로 바꿉니다.
//   4. BodyText/Section0, Section1 ... 의 압축을 풀고 레코드 트리를 만듭니다.
//   5. 트리를 돌면서 문단과 표를 Markdown으로 바꿉니다.

import * as CFB from "cfb";
import { inflateRaw } from "pako";
import { TAG, buildTree, ctrlId, readRecords, u16, u32, type HwpRecord } from "./records";

export interface ConvertResult {
  markdown: string;
  version: string; // 예: "5.0.3.4"
  sectionCount: number;
}

const CTRL_TABLE = ctrlId("tbl ");
const CTRL_PICTURE = ctrlId("gso ");

export function hwpToMarkdown(fileBytes: Uint8Array): ConvertResult {
  checkOldFormat(fileBytes);

  let container: CFB.CFB$Container;
  try {
    container = CFB.read(fileBytes, { type: "array" });
  } catch {
    throw new Error("HWP 파일을 열 수 없습니다. 파일이 손상되었거나 HWP 5.0 형식이 아닙니다.");
  }

  // ---- 2. FileHeader ----
  const header = readStream(container, "FileHeader");
  if (!header) throw new Error("FileHeader가 없습니다. HWP 5.0 파일이 아닌 것 같습니다.");

  const signature = new TextDecoder("ascii").decode(header.subarray(0, 17));
  if (signature !== "HWP Document File") {
    throw new Error("HWP 5.0 파일 서명이 아닙니다.");
  }

  const rawVersion = u32(header, 32);
  const version = [24, 16, 8, 0].map((shift) => (rawVersion >>> shift) & 0xff).join(".");
  const flags = u32(header, 36);
  const compressed = (flags & 0x1) !== 0;
  if (flags & 0x2) throw new Error("암호가 걸린 문서는 변환할 수 없습니다.");
  if (flags & 0x4) throw new Error("배포용 문서는 내용이 암호화되어 있어 변환할 수 없습니다.");

  const unpack = (bytes: Uint8Array) => (compressed ? inflateRaw(bytes) : bytes);

  // ---- 3. DocInfo: 스타일 이름 목록 ----
  const docInfo = readStream(container, "DocInfo");
  const styleNames = docInfo ? readStyleNames(unpack(docInfo)) : [];

  // ---- 4~5. 본문 섹션들 ----
  const parts: string[] = [];
  let sectionCount = 0;
  for (;;) {
    const section = readStream(container, `BodyText/Section${sectionCount}`);
    if (!section) break;
    const tree = buildTree(readRecords(unpack(section)));
    parts.push(renderParagraphs(tree, { styleNames, insideTable: false }));
    sectionCount++;
  }

  if (sectionCount === 0) throw new Error("본문(BodyText)을 찾을 수 없습니다.");

  return { markdown: tidy(parts.join("\n\n")), version, sectionCount };
}

// ---------------------------------------------------------------------------
// 파일 읽기 도우미
// ---------------------------------------------------------------------------

function readStream(container: CFB.CFB$Container, path: string): Uint8Array | null {
  const entry = CFB.find(container, `/${path}`);
  if (!entry || !entry.content) return null;
  return entry.content instanceof Uint8Array ? entry.content : Uint8Array.from(entry.content);
}

/** HWP 3.0/97, HWPX 파일이면 알기 쉬운 오류를 냅니다. */
function checkOldFormat(bytes: Uint8Array) {
  const head = new TextDecoder("ascii").decode(bytes.subarray(0, 30));
  if (head.startsWith("HWP Document File V")) {
    throw new Error("HWP 3.0 / 97 이하 버전 파일입니다. 현재는 HWP 5.0(2002년 이후)만 지원합니다.");
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new Error("HWPX(ZIP) 파일입니다. 현재는 .hwp(HWP 5.0)만 지원합니다.");
  }
}

/** DocInfo의 STYLE 레코드에서 스타일 이름을 순서대로 꺼냅니다. (순서 = 스타일 ID) */
function readStyleNames(docInfo: Uint8Array): string[] {
  return readRecords(docInfo)
    .filter((record) => record.tagId === TAG.STYLE)
    .map((record) => {
      const length = u16(record.data, 0);
      return readUtf16(record.data, 2, length);
    });
}

function readUtf16(data: Uint8Array, offset: number, charCount: number): string {
  let text = "";
  for (let i = 0; i < charCount; i++) text += String.fromCharCode(u16(data, offset + i * 2));
  return text;
}

// ---------------------------------------------------------------------------
// 문단 → Markdown
// ---------------------------------------------------------------------------

interface RenderContext {
  styleNames: string[];
  insideTable: boolean; // 표 안에서는 제목(#)이나 줄바꿈을 쓸 수 없습니다.
}

/** 여러 문단(PARA_HEADER 레코드)을 Markdown으로 바꿉니다. */
function renderParagraphs(records: HwpRecord[], ctx: RenderContext): string {
  const lines: string[] = [];
  for (const record of records) {
    if (record.tagId === TAG.PARA_HEADER) lines.push(renderParagraph(record, ctx));
  }
  if (!ctx.insideTable) return lines.join("\n\n");

  // 표 칸 안에서는 빈 문단 때문에 생긴 연속된 <br>을 하나로 줄입니다.
  return lines
    .join("<br>")
    .replace(/(\s*<br>\s*){2,}/g, "<br>")
    .replace(/^(\s*<br>)+|(<br>\s*)+$/g, "");
}

function renderParagraph(para: HwpRecord, ctx: RenderContext): string {
  const textRecord = para.children.find((child) => child.tagId === TAG.PARA_TEXT);
  const controls = para.children.filter((child) => child.tagId === TAG.CTRL_HEADER);

  let text = "";
  let controlIndex = 0;

  if (textRecord) {
    const data = textRecord.data;
    for (let i = 0; i + 1 < data.length; i += 2) {
      const code = u16(data, i);

      if (code >= 32) {
        text += String.fromCharCode(code);
        continue;
      }

      // 0~31은 "제어 문자"입니다. 스펙에 따라 크기가 1글자 또는 8글자입니다.
      if (isOneCharControl(code)) {
        if (code === 10) text += ctx.insideTable ? "<br>" : "  \n"; // 문단 안 줄바꿈
        else if (code === 24) text += "-"; // 하이픈
        else if (code === 30 || code === 31) text += " "; // 묶음 빈칸, 고정폭 빈칸
        continue;
      }

      // 나머지 제어 문자는 8글자(16바이트) 크기이므로 7글자를 더 건너뜁니다.
      i += 14;
      if (code === 9) {
        text += ctx.insideTable ? " " : "\t"; // 탭
      } else if (isExtendedControl(code)) {
        // 확장 제어 문자 하나는 CTRL_HEADER 레코드 하나와 순서대로 짝을 이룹니다.
        const control = controls[controlIndex++];
        if (control) text += renderControl(control, ctx);
      }
    }
  }

  const trimmed = text.replace(/[ \t]+$/g, "");
  if (ctx.insideTable || trimmed.trim() === "") return trimmed;

  // "개요 1" ~ "개요 6" 스타일은 Markdown 제목으로 바꿉니다.
  const styleId = para.data[10] ?? 0;
  const level = headingLevel(ctx.styleNames[styleId]);
  if (level > 0 && !trimmed.includes("\n")) return `${"#".repeat(level)} ${trimmed.trim()}`;

  return trimmed;
}

function isOneCharControl(code: number): boolean {
  return code === 0 || code === 10 || code === 13 || (code >= 24 && code <= 31);
}

function isExtendedControl(code: number): boolean {
  return [1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23].includes(code);
}

function headingLevel(styleName: string | undefined): number {
  const match = styleName?.match(/^(?:개요|Outline)\s*(\d)$/);
  if (!match) return 0;
  return Math.min(Number(match[1]), 6);
}

// ---------------------------------------------------------------------------
// 컨트롤(표, 그림 등) → Markdown
// ---------------------------------------------------------------------------

function renderControl(control: HwpRecord, ctx: RenderContext): string {
  const id = u32(control.data, 0);
  if (id === CTRL_TABLE) {
    const table = renderTable(control, ctx);
    return ctx.insideTable ? table : `\n\n${table}\n\n`;
  }
  if (id === CTRL_PICTURE) return " *(그림)* ";
  // 머리말, 꼬리말, 쪽 번호, 구역 정의 등은 본문 변환에서 생략합니다.
  return "";
}

/**
 * 표 컨트롤의 자식 구조는 다음과 같습니다.
 *   TABLE (행/열 개수)
 *   LIST_HEADER (셀 1의 위치) → PARA_HEADER, PARA_HEADER ... (셀 1의 문단들)
 *   LIST_HEADER (셀 2의 위치) → PARA_HEADER ...
 */
function renderTable(control: HwpRecord, ctx: RenderContext): string {
  const tableInfo = control.children.find((child) => child.tagId === TAG.TABLE);
  const rows = tableInfo ? u16(tableInfo.data, 4) : 0;
  const cols = tableInfo ? u16(tableInfo.data, 6) : 0;
  if (rows === 0 || cols === 0) return "";

  // 셀마다 위치와 문단을 모읍니다.
  const cells: { row: number; col: number; paragraphs: HwpRecord[] }[] = [];
  for (const child of control.children) {
    if (child.tagId === TAG.LIST_HEADER) {
      cells.push({ col: u16(child.data, 8), row: u16(child.data, 10), paragraphs: [] });
    } else if (child.tagId === TAG.PARA_HEADER && cells.length > 0) {
      cells[cells.length - 1].paragraphs.push(child);
    }
  }

  // rows × cols 크기의 빈 표를 만들고 셀 내용을 채웁니다. (병합된 칸은 비워 둡니다)
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));
  const cellCtx = { ...ctx, insideTable: true };
  cells.forEach((cell, index) => {
    // 위치 정보가 이상하면 순서대로 채웁니다.
    const valid = cell.row < rows && cell.col < cols;
    const row = valid ? cell.row : Math.floor(index / cols);
    const col = valid ? cell.col : index % cols;
    if (row < rows) grid[row][col] = renderParagraphs(cell.paragraphs, cellCtx);
  });

  // 표 안의 표는 Markdown으로 그릴 수 없으므로 "칸 / 칸" 형태의 글자로 펼칩니다.
  if (ctx.insideTable) {
    return grid.map((row) => row.filter(Boolean).join(" / ")).filter(Boolean).join("<br>");
  }

  const escape = (value: string) => value.replace(/\|/g, "\\|").trim() || " ";
  const line = (row: string[]) => `| ${row.map(escape).join(" | ")} |`;
  return [line(grid[0]), line(Array(cols).fill("---")), ...grid.slice(1).map(line)].join("\n");
}

/** 빈 줄이 3개 이상 이어지면 하나로 줄입니다. */
function tidy(markdown: string): string {
  return markdown.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
