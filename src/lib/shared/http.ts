export type RangeRequest = { start: number; end?: number } | { suffixLength: number };

export interface ByteRange {
  start: number;
  end: number;
  total: number;
}

// Only the first range is used if multiple ranges are requested
export const parseRangeHeader = (value: string | null): RangeRequest | undefined => {
  const match = value?.match(/^bytes=\s*(\d*)-(\d*)/);
  if (!match) return undefined;

  const [, start, end] = match;
  if (start) {
    return { start: parseInt(start, 10), end: end ? parseInt(end, 10) : undefined };
  } else if (end) {
    return { suffixLength: parseInt(end, 10) };
  }
};

// Returns `null` if the range is not satisfiable
export const resolveRange = (range: RangeRequest | undefined, total: number): ByteRange | null => {
  if (!range) {
    return { start: 0, end: total - 1, total };
  }

  const start = "suffixLength" in range ? Math.max(0, total - range.suffixLength) : range.start;
  const end = "suffixLength" in range ? total - 1 : Math.min(range.end ?? total - 1, total - 1);
  return start <= end ? { start, end, total } : null;
};

export const getContentRangeHeader = (range: ByteRange) => {
  return { "Content-Range": `bytes ${range.start}-${range.end}/${range.total}` };
};
