// samples 폴더의 .hwp 파일을 변환해서 결과를 확인하는 스크립트입니다.
// 실행: npm test
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hwpToMarkdown } from "../lib/hwp/hwpToMarkdown";

const dir = join(__dirname, "..", "samples");

const files = readdirSync(dir).filter((file) => file.endsWith(".hwp"));
if (files.length === 0) console.log("samples 폴더에 .hwp 파일을 넣고 다시 실행하세요.");

for (const name of files) {
  const result = hwpToMarkdown(new Uint8Array(readFileSync(join(dir, name))));
  const outPath = join(dir, name.replace(/\.hwp$/, ".md"));
  writeFileSync(outPath, result.markdown);
  console.log(`✅ ${name} → ${outPath} (버전 ${result.version}, 섹션 ${result.sectionCount}개)`);
}
