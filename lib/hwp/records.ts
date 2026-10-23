// HWP 5.0 파일 안의 "레코드"를 읽는 코드입니다.
//
// HWP 5.0 본문은 작은 데이터 조각(레코드)이 줄지어 있는 구조입니다.
// 레코드마다 맨 앞 4바이트(헤더)에 아래 세 가지 정보가 들어 있습니다.
//   - tagId (10비트): 이 레코드의 종류 (문단, 글자, 표 ...)
//   - level (10비트): 트리에서의 깊이 (표 안의 문단은 더 깊습니다)
//   - size  (12비트): 뒤따르는 데이터 길이 (0xFFF면 다음 4바이트에 실제 길이)

const HWPTAG_BEGIN = 0x10;

// 이 프로젝트에서 사용하는 태그 번호 (한글 문서 형식 5.0 공개 스펙 기준)
export const TAG = {
  STYLE: HWPTAG_BEGIN + 26, // DocInfo: 스타일 (예: "개요 1")
  PARA_HEADER: HWPTAG_BEGIN + 50, // 문단 시작
  PARA_TEXT: HWPTAG_BEGIN + 51, // 문단의 글자들
  CTRL_HEADER: HWPTAG_BEGIN + 55, // 컨트롤(표, 그림, 머리말 ...) 시작
  LIST_HEADER: HWPTAG_BEGIN + 56, // 표 셀 등 문단 목록의 시작
  TABLE: HWPTAG_BEGIN + 61, // 표 정보 (행/열 개수)
} as const;

export interface HwpRecord {
  tagId: number;
  level: number;
  data: Uint8Array;
  children: HwpRecord[];
}

/** 바이트 배열을 레코드 목록으로 잘라냅니다. */
export function readRecords(bytes: Uint8Array): HwpRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: HwpRecord[] = [];
  let offset = 0;

  while (offset + 4 <= bytes.length) {
    const header = view.getUint32(offset, true);
    offset += 4;

    const tagId = header & 0x3ff;
    const level = (header >>> 10) & 0x3ff;
    let size = (header >>> 20) & 0xfff;

    // 데이터가 4095바이트 이상이면 실제 길이가 다음 4바이트에 있습니다.
    if (size === 0xfff) {
      size = view.getUint32(offset, true);
      offset += 4;
    }

    records.push({ tagId, level, data: bytes.subarray(offset, offset + size), children: [] });
    offset += size;
  }

  return records;
}

/**
 * 평평한 레코드 목록을 level 값으로 트리 구조로 만듭니다.
 * level이 바로 앞 레코드보다 크면 그 레코드의 자식이 됩니다.
 */
export function buildTree(records: HwpRecord[]): HwpRecord[] {
  const roots: HwpRecord[] = [];
  const stack: HwpRecord[] = [];

  for (const record of records) {
    while (stack.length > 0 && stack[stack.length - 1].level >= record.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(record);
    else roots.push(record);
    stack.push(record);
  }

  return roots;
}

/** 리틀엔디언 숫자 읽기 도우미 */
export function u16(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) return 0;
  return data[offset] | (data[offset + 1] << 8);
}

export function u32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) return 0;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

/** 컨트롤 ID 4글자(예: "tbl ")를 숫자로 바꿉니다. 스펙의 MAKE_4CHID와 같습니다. */
export function ctrlId(text: string): number {
  return (
    ((text.charCodeAt(0) << 24) |
      (text.charCodeAt(1) << 16) |
      (text.charCodeAt(2) << 8) |
      text.charCodeAt(3)) >>>
    0
  );
}
