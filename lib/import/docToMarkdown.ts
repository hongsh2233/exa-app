// DOC(Word 97~2003) 파일에서 글자를 꺼내 Markdown으로 바꿉니다.
//
// DOC도 HWP 5.0처럼 CFB(복합 파일) 형식입니다.
//   - WordDocument 스트림: 맨 앞에 FIB(파일 정보)가 있고, 본문 글자가 들어 있습니다.
//   - 0Table 또는 1Table 스트림: 글자가 어디에 있는지 알려주는 "조각 표(piece table)"가 있습니다.
// 조각 표를 따라가며 글자를 순서대로 이어 붙이면 본문이 됩니다.
//
// 지원: 문단, 줄바꿈, 표(간단한 형태), 필드 결과(예: 날짜, 쪽 번호)
// 미지원: 제목 스타일, 글자 서식, 그림

import * as CFB from "cfb";

export function docToMarkdown(fileBytes: Uint8Array): string {
  let container: CFB.CFB$Container;
  try {
    container = CFB.read(fileBytes, { type: "array" });
  } catch {
    throw new Error("DOC 파일을 열 수 없습니다. 파일이 손상되었거나 DOC 형식이 아닙니다.");
  }

  const word = readStream(container, "WordDocument");
  if (!word) throw new Error("WordDocument가 없습니다. Word 97~2003 DOC 파일이 아닙니다.");

  const view = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const ident = view.getUint16(0, true);
  if (ident !== 0xa5ec) throw new Error("Word 97~2003 형식이 아닙니다. (Word 95 이하는 지원하지 않습니다)");

  const flags = view.getUint16(0x0a, true);
  if (flags & 0x0100) throw new Error("암호가 걸린 DOC 파일은 변환할 수 없습니다.");

  // FIB 안에서 필요한 값의 위치를 계산합니다.
  const csw = view.getUint16(32, true); // 뒤따르는 16비트 값 개수
  const rgLwStart = 32 + 2 + csw * 2 + 2;
  const ccpText = view.getInt32(rgLwStart + 12, true); // 본문 글자 수 (각주, 머리말 제외)
  const cslw = view.getUint16(rgLwStart - 2, true);
  const rgFcLcbStart = rgLwStart + cslw * 4 + 2;
  const fcClx = view.getUint32(rgFcLcbStart + 33 * 8, true); // 조각 표 위치
  const lcbClx = view.getUint32(rgFcLcbStart + 33 * 8 + 4, true); // 조각 표 크기

  const table = readStream(container, flags & 0x0200 ? "1Table" : "0Table");
  if (!table || lcbClx === 0) throw new Error("DOC 파일의 본문 위치 정보를 찾을 수 없습니다.");

  const text = readPieces(word, table.subarray(fcClx, fcClx + lcbClx)).slice(0, ccpText);
  return textToMarkdown(text);
}

function readStream(container: CFB.CFB$Container, name: string): Uint8Array | null {
  const entry = CFB.find(container, `/${name}`);
  if (!entry || !entry.content) return null;
  return entry.content instanceof Uint8Array ? entry.content : Uint8Array.from(entry.content);
}

/** 조각 표(CLX)를 읽어서 본문 글자를 순서대로 이어 붙입니다. */
function readPieces(word: Uint8Array, clx: Uint8Array): string {
  const view = new DataView(clx.buffer, clx.byteOffset, clx.byteLength);
  let offset = 0;

  // 앞부분의 서식 정보(Prc, 0x01로 시작)는 건너뜁니다.
  while (clx[offset] === 0x01) offset += 3 + view.getInt16(offset + 1, true);
  if (clx[offset] !== 0x02) throw new Error("DOC 파일의 조각 표 형식이 올바르지 않습니다.");

  const size = view.getUint32(offset + 1, true);
  const plc = new DataView(clx.buffer, clx.byteOffset + offset + 5, size);
  const count = (size - 4) / 12; // 위치(4바이트) n+1개 + 조각 정보(8바이트) n개

  const utf16 = new TextDecoder("utf-16le");
  let text = "";

  for (let i = 0; i < count; i++) {
    const charCount = plc.getUint32((i + 1) * 4, true) - plc.getUint32(i * 4, true);
    const fcValue = plc.getUint32((count + 1) * 4 + i * 8 + 2, true);
    const compressed = (fcValue & 0x40000000) !== 0;
    const fc = fcValue & 0x3fffffff;

    // 압축된 조각은 1글자 = 1바이트(영문), 아니면 1글자 = 2바이트(한글 등 유니코드)입니다.
    if (compressed) {
      const start = fc / 2;
      text += decodeCompressed(word.subarray(start, start + charCount));
    } else {
      text += utf16.decode(word.subarray(fc, fc + charCount * 2));
    }
  }

  return text;
}

// 압축된 글자 중 0x80~0x9F는 따옴표, 말줄임표 같은 특수 문자입니다. (Word 스펙의 변환표)
// TextDecoder("windows-1252")는 환경에 따라 이 구간을 다르게 처리해서 직접 바꿉니다.
const CP1252_SPECIAL: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function decodeCompressed(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(CP1252_SPECIAL[byte] ?? byte);
  return text;
}

/** Word의 특수 문자를 정리하고 문단과 표를 Markdown으로 만듭니다. */
function textToMarkdown(raw: string): string {
  const text = removeFieldCodes(raw)
    .replace(/[\x01\x08]/g, " *(그림)* ")
    .replace(/\x0b/g, "  \n") // 줄바꿈
    .replace(/\x0c/g, "\r") // 쪽 나누기 → 문단 나누기
    .replace(/\x1e/g, "-") // 줄 안 나눔 하이픈
    .replace(/[\x1f\x02-\x06]/g, "")
    .replace(/\xa0/g, " ");

  const blocks: string[] = [];
  let row: string[] = [];
  let tableRows: string[][] = [];
  let cell = "";

  const flushTable = () => {
    if (tableRows.length > 0) blocks.push(renderTable(tableRows));
    tableRows = [];
  };

  // 표의 셀은 \x07로 끝나고, 행은 마지막 셀 뒤에 \x07이 하나 더 붙습니다. (예: "가\x07나\x07\x07")
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\x07") {
      if (cell === "" && text[i - 1] === "\x07" && row.length > 0) {
        tableRows.push(row);
        row = [];
      } else {
        row.push(cell);
      }
      cell = "";
    } else if (char === "\r") {
      // 표의 한 행을 읽는 중이면 셀 안의 문단으로 봅니다.
      // (정확히 구분하려면 문단 서식까지 읽어야 해서, 첫 번째 셀 안의 문단은 일반 문단으로 나올 수 있습니다)
      if (row.length > 0) {
        cell += "<br>";
      } else {
        flushTable();
        blocks.push(cell);
        cell = "";
      }
    } else {
      cell += char;
    }
  }
  flushTable();
  if (cell) blocks.push(cell);

  return (
    blocks
      .map((block) => block.replace(/[ \t]+$/g, ""))
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/** 필드(예: 날짜, 목차)는 결과 부분만 남깁니다. \x13 코드 \x14 결과 \x15 */
function removeFieldCodes(text: string): string {
  let result = "";
  const stack: boolean[] = []; // 각 필드가 결과 부분에 들어왔는지
  for (const char of text) {
    if (char === "\x13") stack.push(false);
    else if (char === "\x14") stack[stack.length - 1] = true;
    else if (char === "\x15") stack.pop();
    else if (stack.every(Boolean)) result += char;
  }
  return result;
}

function renderTable(rows: string[][]): string {
  const cols = Math.max(...rows.map((row) => row.length));
  const escape = (value = "") => value.replace(/\|/g, "\\|").replace(/^(<br>)+|(<br>)+$/g, "").trim() || " ";
  const line = (row: string[]) => `| ${Array.from({ length: cols }, (_, i) => escape(row[i])).join(" | ")} |`;
  return [line(rows[0]), line(Array(cols).fill("---")), ...rows.slice(1).map(line)].join("\n");
}
