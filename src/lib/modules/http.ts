export const parseRangeHeader = (value: string | null) => {
  if (!value) return undefined;

  const firstRange = value.split(",")[0]!.trim();
  const parts = firstRange.replace(/bytes=/, "").split("-");
  return {
    start: parts[0] ? parseInt(parts[0], 10) : undefined,
    end: parts[1] ? parseInt(parts[1], 10) : undefined,
  };
};

export const getContentRangeHeader = (range?: { start: number; end: number; total: number }) => {
  return range && { "Content-Range": `bytes ${range.start}-${range.end}/${range.total}` };
};

export const parseContentDigestHeader = (value: string | null) => {
  if (!value) return undefined;

  const firstDigest = value.split(",")[0]!.trim();
  const match = firstDigest.match(/^sha-256=:([A-Za-z0-9+/=]+):$/);
  return match?.[1];
};
