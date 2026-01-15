import { disassemble, getChoseong } from "es-hangul";

const normalize = (s: string) => {
  return s.normalize("NFC").toLowerCase().replace(/\s/g, "");
};

const extractHangul = (s: string) => {
  return s.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
};

const hangulSearch = (original: string, query: string) => {
  original = extractHangul(original);
  query = extractHangul(query);
  if (!original || !query) return false;

  return (
    disassemble(original).includes(disassemble(query)) ||
    getChoseong(original).includes(getChoseong(query))
  );
};

export const searchString = (original: string, query: string) => {
  original = normalize(original);
  query = normalize(query);
  if (!original || !query) return false;

  return original.includes(query) || hangulSearch(original, query);
};
