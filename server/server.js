// 서식을 유지하는 문서 변환 서버입니다.
//
// LibreOffice(+ HWP를 여는 H2Orestart 확장)를 명령어로 실행해서 변환합니다.
//   POST /convert?to=pdf   (본문: 파일 내용, 헤더 X-File-Name: 원래 파일 이름)
//   GET  /health           (서버가 살아 있는지 확인)
//
// 외부 라이브러리 없이 Node.js 기본 기능만 사용합니다.

const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// ---------------- 설정 (환경 변수로 바꿀 수 있습니다) ----------------
const PORT = Number(process.env.PORT || 10000);
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 20);
const TIMEOUT_SECONDS = Number(process.env.TIMEOUT_SECONDS || 120);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((origin) => origin.trim());
const API_KEY = process.env.API_KEY || ""; // 설정하면 "Authorization: Bearer <키>" 헤더가 필요합니다.

// 받을 수 있는 파일과 만들 수 있는 파일
const INPUT_TYPES = ["hwp", "hwpx", "doc", "docx", "odt", "rtf"];
const OUTPUT_TYPES = {
  pdf: { filter: "pdf:writer_pdf_Export", mime: "application/pdf" },
  docx: {
    filter: "docx:MS Word 2007 XML",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  doc: { filter: "doc:MS Word 97", mime: "application/msword" },
  odt: { filter: "odt", mime: "application/vnd.oasis.opendocument.text" },
};

// 파일 맨 앞의 "서명" 바이트로 진짜 문서 파일인지 확인합니다.
const CFB = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // HWP 5.0, DOC (복합 파일)
const ZIP = Buffer.from("PK\x03\x04", "latin1"); // HWPX, DOCX, ODT (ZIP 압축)
const SIGNATURES = {
  hwp: [CFB, Buffer.from("HWP Document File")], // 뒤쪽은 HWP 3.0/97
  hwpx: [ZIP],
  doc: [CFB],
  docx: [ZIP],
  odt: [ZIP],
  rtf: [Buffer.from("{\\rtf")],
};

function hasValidSignature(inputType, body) {
  return SIGNATURES[inputType].some((signature) => body.subarray(0, signature.length).equals(signature));
}

// ---------------- 변환 대기열 ----------------
// LibreOffice는 메모리를 많이 써서, 무료 서버(512MB)에서는 한 번에 하나씩만 변환합니다.
let queue = Promise.resolve();
function enqueue(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

/** LibreOffice로 파일 하나를 변환하고, 결과 파일 경로를 돌려줍니다. */
async function convert(inputPath, outputType, workDir) {
  const args = [
    "--headless",
    "--norestore",
    `-env:UserInstallation=file://${path.join(os.tmpdir(), "lo-profile")}`,
    "--convert-to",
    OUTPUT_TYPES[outputType].filter,
    "--outdir",
    workDir,
    inputPath,
  ];

  await new Promise((resolve, reject) => {
    const child = spawn("soffice", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new HttpError(504, `변환 시간이 ${TIMEOUT_SECONDS}초를 넘었습니다.`));
    }, TIMEOUT_SECONDS * 1000);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`LibreOffice 종료 코드 ${code}: ${stderr.slice(-500)}`));
    });
  });

  const outputPath = path.join(workDir, `input.${outputType}`);
  try {
    await fs.access(outputPath);
  } catch {
    // 파일이 손상됐거나 지원하지 않는 내용이면 결과 파일이 만들어지지 않습니다.
    throw new HttpError(422, "문서를 변환하지 못했습니다. 파일이 손상되었거나 암호가 걸려 있을 수 있습니다.");
  }
  return outputPath;
}

// ---------------- HTTP 처리 ----------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes("*")) res.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-File-Name, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** 요청 본문(파일)을 읽습니다. 너무 크면 중간에 멈춥니다. */
function readBody(req) {
  const limit = MAX_FILE_MB * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, `파일이 너무 큽니다. (최대 ${MAX_FILE_MB}MB)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleConvert(req, res, url) {
  if (API_KEY && req.headers.authorization !== `Bearer ${API_KEY}`) {
    throw new HttpError(401, "API 키가 올바르지 않습니다.");
  }

  const outputType = url.searchParams.get("to") || "pdf";
  if (!OUTPUT_TYPES[outputType]) {
    throw new HttpError(400, `만들 수 있는 형식: ${Object.keys(OUTPUT_TYPES).join(", ")}`);
  }

  const fileName = decodeURIComponent(req.headers["x-file-name"] || "");
  const inputType = path.extname(fileName).slice(1).toLowerCase();
  if (!INPUT_TYPES.includes(inputType)) {
    throw new HttpError(400, `받을 수 있는 형식: ${INPUT_TYPES.join(", ")} (X-File-Name 헤더에 파일 이름을 넣어 주세요)`);
  }

  const body = await readBody(req);
  if (body.length === 0) throw new HttpError(400, "파일 내용이 비어 있습니다.");
  // LibreOffice는 읽지 못하는 파일을 일반 글자로 보고 그대로 변환해 버려서, 미리 파일 형식을 확인합니다.
  if (!hasValidSignature(inputType, body)) {
    throw new HttpError(422, `올바른 ${inputType.toUpperCase()} 파일이 아닙니다. 파일이 손상되었거나 확장자가 다릅니다.`);
  }

  // 요청마다 임시 폴더를 만들고, 끝나면 지웁니다. (파일 이름은 "input"으로 바꿔서 안전하게 저장)
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "convert-"));
  try {
    const inputPath = path.join(workDir, `input.${inputType}`);
    await fs.writeFile(inputPath, body);

    const started = Date.now();
    const outputPath = await enqueue(() => convert(inputPath, outputType, workDir));
    const output = await fs.readFile(outputPath);
    console.log(`변환 완료: ${inputType} → ${outputType}, ${body.length}B → ${output.length}B, ${Date.now() - started}ms`);

    const outputName = `${path.basename(fileName, path.extname(fileName))}.${outputType}`;
    res.writeHead(200, {
      "Content-Type": OUTPUT_TYPES[outputType].mime,
      "Content-Length": output.length,
      "Content-Disposition": `attachment; filename="converted.${outputType}"; filename*=UTF-8''${encodeURIComponent(outputName)}`,
    });
    res.end(output);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  const url = new URL(req.url, "http://localhost");

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
    } else if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, inputs: INPUT_TYPES, outputs: Object.keys(OUTPUT_TYPES) });
    } else if (req.method === "POST" && url.pathname === "/convert") {
      await handleConvert(req, res, url);
    } else {
      sendJson(res, 404, { error: "없는 주소입니다. POST /convert?to=pdf 를 사용하세요." });
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? "서버에서 변환 중 오류가 났습니다." : error.message });
  }
});

server.listen(PORT, () => console.log(`변환 서버 실행 중: http://localhost:${PORT}`));
