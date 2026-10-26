"use client";

// "일괄 MD 변환" 창입니다.
// 여러 파일을 골라 한 번에 Markdown으로 바꾸고, 결과를 ZIP 파일 하나로 내려받습니다.
// 변환은 편집기 "열기"와 같은 방식으로 브라우저 안에서만 일어납니다.

import { useRef, useState } from "react";
import { ACCEPTED_FILES } from "@/lib/import/importFile";
import type { BatchItemResult } from "@/lib/import/batchToMarkdown";
import { downloadBlob } from "@/lib/export/download";

export default function BatchConvertDialog({
  initialFiles = [],
  onClose,
}: {
  initialFiles?: File[];
  onClose: () => void;
}) {
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [results, setResults] = useState<BatchItemResult[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function convert() {
    setBusy(true);
    setResults([]);
    try {
      const { batchToMarkdown } = await import("@/lib/import/batchToMarkdown"); // 필요할 때만 불러옵니다.
      const { results, zip } = await batchToMarkdown(files, (done, total, current) =>
        setStatus(current ? `${done + 1}/${total} ${current} 변환 중...` : "ZIP 파일 만드는 중..."),
      );
      setResults(results);
      const failed = results.filter((item) => item.error).length;
      if (zip) {
        const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
        downloadBlob(zip, `MD 변환_${date}.zip`);
      }
      setStatus(
        failed === 0
          ? `✅ ${results.length}개 파일을 변환해 ZIP으로 저장했습니다`
          : `${results.length - failed}개 변환, ❌ ${failed}개 실패${zip ? " (성공한 파일만 ZIP으로 저장했습니다)" : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={(element) => {
        dialogRef.current = element;
        if (element && !element.open) element.showModal();
      }}
      className="convert-dialog"
      onClose={onClose}
    >
      <h2>일괄 MD 변환</h2>
      <p className="hint">여러 문서를 한 번에 Markdown(.md)으로 바꿔 ZIP 파일 하나로 저장합니다. 편집기 내용은 바뀌지 않습니다.</p>

      <label>
        변환할 파일 (HWP, DOCX, DOC, PDF, MD, TXT · 여러 개 선택 가능)
        <input
          type="file"
          accept={ACCEPTED_FILES}
          multiple
          onChange={(event) => {
            setFiles(Array.from(event.target.files ?? []));
            setResults([]);
            setStatus("");
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="batch-list">
          {files.map((file, index) => {
            const result = results[index];
            return (
              <li key={`${file.name}-${index}`} className={result?.error ? "failed" : ""}>
                <span>{file.name}</span>
                <span className="batch-result">
                  {result ? (result.error ? `❌ ${result.error}` : `✅ ${result.mdName}`) : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {status && <p className="convert-status">{status}</p>}

      <div className="dialog-actions">
        <button onClick={() => dialogRef.current?.close()}>닫기</button>
        <button className="primary" onClick={convert} disabled={files.length === 0 || busy}>
          {busy ? "변환 중..." : `${files.length}개 변환`}
        </button>
      </div>
    </dialog>
  );
}
