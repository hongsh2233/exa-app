"use client"; // 이 화면은 브라우저에서 동작합니다. (파일 읽기, 입력 처리 등)

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { hwpToMarkdown } from "@/lib/hwp/hwpToMarkdown";

const STORAGE_KEY = "hwp-md-editor:document";
const WELCOME = `# 환영합니다 👋

왼쪽에 **Markdown**을 쓰면 오른쪽에 미리보기가 나옵니다.

- 위의 **열기** 버튼으로 \`.hwp\`(HWP 5.0) 또는 \`.md\` 파일을 불러올 수 있습니다.
- 파일을 이 화면에 끌어다 놓아도 됩니다.
- 작성한 내용은 브라우저에 자동 저장됩니다.
`;

type ViewMode = "split" | "edit" | "preview";

export default function EditorPage() {
  const [text, setText] = useState(WELCOME);
  const [fileName, setFileName] = useState("새 문서");
  const [status, setStatus] = useState("준비됨");
  const [view, setView] = useState<ViewMode>("split");
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 처음 열 때: 자동 저장된 내용이 있으면 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { text, fileName } = JSON.parse(saved);
        setText(text);
        setFileName(fileName);
        setStatus("이전에 작성하던 내용을 불러왔습니다");
      }
    } catch {
      // 저장소를 쓸 수 없는 환경(시크릿 모드 등)이면 그냥 넘어갑니다.
    }
  }, []);

  // 글이 바뀔 때마다 자동 저장 (0.5초 동안 입력이 없을 때)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ text, fileName }));
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [text, fileName]);

  // ---------------- 파일 열기 / 저장 ----------------

  async function openFile(file: File) {
    const baseName = file.name.replace(/\.[^.]+$/, "");
    try {
      if (/\.hwp$/i.test(file.name)) {
        setStatus("HWP 변환 중...");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = hwpToMarkdown(bytes);
        setText(result.markdown);
        setStatus(`HWP ${result.version} 문서를 변환했습니다 (섹션 ${result.sectionCount}개)`);
      } else {
        setText(await file.text());
        setStatus(`${file.name} 파일을 열었습니다`);
      }
      setFileName(baseName);
    } catch (error) {
      setStatus(`❌ ${error instanceof Error ? error.message : "파일을 열 수 없습니다"}`);
    }
  }

  function saveMarkdown() {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 다운로드가 시작될 시간을 준 뒤에 정리합니다. 바로 정리하면 파일 이름이 사라집니다.
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatus(`${fileName}.md 파일로 저장했습니다`);
  }

  function newDocument() {
    if (!confirm("지금 내용을 지우고 새 문서를 만들까요?")) return;
    setText("");
    setFileName("새 문서");
    setStatus("새 문서");
  }

  // ---------------- 서식 버튼 ----------------

  /** 선택한 글자 앞뒤에 기호를 붙입니다. 예: **굵게** */
  function wrapSelection(before: string, after = before, placeholder = "텍스트") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end } = textarea;
    const selected = text.slice(start, end) || placeholder;
    setText(text.slice(0, start) + before + selected + after + text.slice(end));

    // 상태가 바뀐 뒤 커서를 다시 선택 영역에 둡니다.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  /** 현재 줄 맨 앞에 기호를 붙입니다. 예: "# 제목", "- 목록" */
  function prefixLine(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const lineStart = text.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
    setText(text.slice(0, lineStart) + prefix + text.slice(lineStart));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.selectionStart + prefix.length, textarea.selectionStart + prefix.length);
    });
  }

  function insertTable() {
    wrapSelection("\n| 제목1 | 제목2 |\n| --- | --- |\n| ", " | 내용 |\n", "내용");
  }

  // 편집기에서 Tab 키를 누르면 다음 칸으로 넘어가지 않고 들여쓰기를 넣습니다.
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      wrapSelection("  ", "", "");
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      saveMarkdown();
    }
  }

  // ---------------- 화면 ----------------

  return (
    <div
      className={`app ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) openFile(file);
      }}
    >
      <header className="toolbar">
        <input
          className="file-name"
          value={fileName}
          onChange={(event) => setFileName(event.target.value)}
          aria-label="문서 이름"
        />

        <div className="group">
          <button onClick={newDocument}>새 문서</button>
          <button onClick={() => fileInputRef.current?.click()}>열기 (.hwp / .md)</button>
          <button className="primary" onClick={saveMarkdown}>
            MD 저장
          </button>
        </div>

        <div className="group">
          <button onClick={() => prefixLine("# ")} title="제목 1">H1</button>
          <button onClick={() => prefixLine("## ")} title="제목 2">H2</button>
          <button onClick={() => wrapSelection("**")} title="굵게"><b>B</b></button>
          <button onClick={() => wrapSelection("*")} title="기울임"><i>I</i></button>
          <button onClick={() => prefixLine("- ")} title="목록">• 목록</button>
          <button onClick={() => wrapSelection("[", "](https://)", "링크")} title="링크">링크</button>
          <button onClick={insertTable} title="표 넣기">표</button>
        </div>

        <div className="group view-switch">
          {(["edit", "split", "preview"] as const).map((mode) => (
            <button key={mode} className={view === mode ? "active" : ""} onClick={() => setView(mode)}>
              {{ edit: "편집", split: "나란히", preview: "미리보기" }[mode]}
            </button>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".hwp,.md,.markdown,.txt"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) openFile(file);
            event.target.value = ""; // 같은 파일을 다시 열 수 있도록 초기화
          }}
        />
      </header>

      <main className={`panes ${view}`}>
        {view !== "preview" && (
          <textarea
            ref={textareaRef}
            className="editor"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            placeholder="여기에 Markdown을 입력하세요"
          />
        )}
        {view !== "edit" && (
          <article className="preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
              {text}
            </ReactMarkdown>
          </article>
        )}
      </main>

      <footer className="status">
        <span>{status}</span>
        <span>{text.length.toLocaleString()}자</span>
      </footer>

      {dragging && <div className="drop-hint">여기에 파일을 놓으세요 (.hwp / .md)</div>}
    </div>
  );
}
