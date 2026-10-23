/** Blob(파일 데이터)을 사용자 컴퓨터에 내려받게 합니다. */
export function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 다운로드가 시작될 시간을 준 뒤에 정리합니다. 바로 정리하면 파일 이름이 사라집니다.
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
