"use client";

// "서식 유지 변환" 창입니다.
// Markdown을 거치지 않고, 변환 서버(LibreOffice)에 파일을 보내서 원본 서식 그대로 변환합니다.

import { useRef, useState } from "react";
import { downloadBlob } from "@/lib/export/download";

// Vercel 환경 변수 NEXT_PUBLIC_CONVERT_API_URL에 변환 서버 주소를 넣으면 이 기능이 켜집니다.
export const CONVERT_API_URL = process.env.NEXT_PUBLIC_CONVERT_API_URL?.replace(/\/$/, "") ?? "";

const INPUT_FILES = ".hwp,.hwpx,.doc,.docx,.odt,.rtf";
const OUTPUTS = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word (.docx)" },
  { value: "doc", label: "Word 97-2003 (.doc)" },
  { value: "odt", label: "OpenDocument (.odt)" },
];

export default function FormatConvertDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState("pdf");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function convert() {
    if (!file) return;
    setBusy(true);
    setStatus("변환 중...");

    // 무료 서버는 한동안 쓰지 않으면 잠들어서, 첫 변환이 오래 걸릴 수 있습니다.
    const slowTimer = setTimeout(() => setStatus("서버를 깨우는 중입니다. 처음에는 1분 정도 걸릴 수 있어요..."), 5000);

    try {
      const response = await fetch(`${CONVERT_API_URL}/convert?to=${output}`, {
        method: "POST",
        headers: { "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      if (!response.ok) {
        const { error } = await response.json().catch(() => ({ error: "" }));
        throw new Error(error || `서버 오류 (${response.status})`);
      }
      const name = `${file.name.replace(/\.[^.]+$/, "")}.${output}`;
      downloadBlob(await response.blob(), name);
      setStatus(`✅ ${name} 파일로 저장했습니다`);
    } catch (error) {
      const message = error instanceof TypeError ? "변환 서버에 연결할 수 없습니다." : (error as Error).message;
      setStatus(`❌ ${message}`);
    } finally {
      clearTimeout(slowTimer);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={(element) => {
        dialogRef.current = element;
        if (element && !element.open) element.showModal(); // 화면 가운데 창으로 띄웁니다.
      }}
      className="convert-dialog"
      onClose={onClose}
    >
      <h2>서식 유지 변환</h2>
      <p className="hint">
        글꼴, 색, 표, 그림까지 원본 모양 그대로 변환합니다. 편집기에는 열리지 않고 변환된 파일이 바로 저장됩니다.
      </p>

      <label>
        변환할 파일 (HWP, HWPX, DOC, DOCX, ODT, RTF)
        <input type="file" accept={INPUT_FILES} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>

      <label>
        만들 형식
        <select value={output} onChange={(event) => setOutput(event.target.value)}>
          {OUTPUTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <p className="hint">⚠️ 파일이 변환 서버로 전송되며, 변환이 끝나면 서버에서 바로 지워집니다.</p>
      {status && <p className="convert-status">{status}</p>}

      <div className="dialog-actions">
        <button onClick={() => dialogRef.current?.close()}>닫기</button>
        <button className="primary" onClick={convert} disabled={!file || busy}>
          {busy ? "변환 중..." : "변환"}
        </button>
      </div>
    </dialog>
  );
}
