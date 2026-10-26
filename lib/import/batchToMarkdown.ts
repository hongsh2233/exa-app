// 여러 파일을 한 번에 Markdown으로 바꾸고, 결과를 ZIP 파일 하나로 묶습니다.
// 파일 하나가 실패해도 나머지는 계속 변환합니다.

import { zipSync, strToU8 } from "fflate";
import { importFile } from "./importFile";

export interface BatchItemResult {
  name: string; // 원래 파일 이름
  mdName?: string; // ZIP 안의 .md 파일 이름 (성공했을 때만)
  error?: string; // 실패 이유 (실패했을 때만)
}

/** "보고서.hwp" → "보고서.md". 이미 쓴 이름이면 "보고서 (2).md"처럼 번호를 붙입니다. */
export function uniqueMdName(fileName: string, used: Set<string>): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "문서";
  let name = `${base}.md`;
  for (let count = 2; used.has(name.toLowerCase()); count++) name = `${base} (${count}).md`;
  used.add(name.toLowerCase());
  return name;
}

export async function batchToMarkdown(
  files: File[],
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<{ results: BatchItemResult[]; zip: Blob | null }> {
  const entries: Record<string, Uint8Array> = {};
  const results: BatchItemResult[] = [];
  const used = new Set<string>();

  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length, file.name);
    try {
      const { markdown } = await importFile(file);
      const mdName = uniqueMdName(file.name, used);
      entries[mdName] = strToU8(markdown);
      results.push({ name: file.name, mdName });
    } catch (error) {
      results.push({ name: file.name, error: error instanceof Error ? error.message : "변환하지 못했습니다" });
    }
  }
  onProgress?.(files.length, files.length, "");

  const zip = Object.keys(entries).length > 0 ? zipSync(entries) : null;
  return { results, zip: zip && new Blob([zip as BlobPart], { type: "application/zip" }) };
}
