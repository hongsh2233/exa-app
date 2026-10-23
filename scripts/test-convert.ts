// samples 폴더의 .hwp / .docx / .doc 파일을 Markdown으로 변환해서 결과를 확인하는 스크립트입니다.
// (PDF는 브라우저 전용 기능을 써서 여기서는 확인하지 않습니다)
// 실행: npm test
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hwpToMarkdown } from "../lib/hwp/hwpToMarkdown";
import { docxToMarkdown } from "../lib/import/docxToMarkdown";
import { docToMarkdown } from "../lib/import/docToMarkdown";

const dir = join(__dirname, "..", "samples");

async function toMarkdown(name: string, bytes: Buffer): Promise<string> {
  if (/\.hwp$/i.test(name)) return hwpToMarkdown(new Uint8Array(bytes)).markdown;
  if (/\.doc$/i.test(name)) return docToMarkdown(new Uint8Array(bytes));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer;
  return docxToMarkdown(arrayBuffer);
}

async function main() {
  const files = readdirSync(dir).filter((file) => /\.(hwp|docx|doc)$/i.test(file));
  if (files.length === 0) console.log("samples 폴더에 .hwp / .docx / .doc 파일을 넣고 다시 실행하세요.");

  for (const name of files) {
    const markdown = await toMarkdown(name, readFileSync(join(dir, name)));
    const outPath = join(dir, `${name}.md`);
    writeFileSync(outPath, markdown);
    console.log(`✅ ${name} → ${outPath} (${markdown.length}자)`);
  }
}

main();
