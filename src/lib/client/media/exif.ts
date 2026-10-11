import ExifReader from "exifreader";

export const extractExifDateTime = (fileBuffer: ArrayBuffer) => {
  const exif = ExifReader.load(fileBuffer);
  const dateTimeOriginal = exif["DateTimeOriginal"]?.description;
  const offsetTimeOriginal = exif["OffsetTimeOriginal"]?.description;
  if (!dateTimeOriginal) return undefined;

  const [date, time] = dateTimeOriginal.split(" ");
  if (!date || !time) return undefined;

  const [year, month, day] = date.split(":").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  if (!year || !month || !day || !hour || !minute || !second) return undefined;

  if (!offsetTimeOriginal) {
    // No timezone information.. Assume local timezone
    return new Date(year, month - 1, day, hour, minute, second);
  }

  const offsetSign = offsetTimeOriginal[0] === "+" ? 1 : -1;
  const [offsetHour, offsetMinute] = offsetTimeOriginal.slice(1).split(":").map(Number);

  const utcDate = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = offsetSign * ((offsetHour ?? 0) * 60 + (offsetMinute ?? 0)) * 60 * 1000;
  return new Date(utcDate - offsetMs);
};

const EXIF_SEARCH_SIZE = 1024 * 1024; // 1 MiB
const MAX_FULL_READ_SIZE = 64 * 1024 * 1024; // 64 MiB

const tryExtractExifDateTime = (buffer: ArrayBuffer) => {
  try {
    return extractExifDateTime(buffer);
  } catch {
    return undefined;
  }
};

// EXIF is usually at the beginning of the file, so the whole file is read only if not found
export const readExifDateTime = async (file: Blob) => {
  const dateTime = tryExtractExifDateTime(await file.slice(0, EXIF_SEARCH_SIZE).arrayBuffer());
  if (dateTime || file.size <= EXIF_SEARCH_SIZE || file.size > MAX_FULL_READ_SIZE) {
    return dateTime;
  }
  return tryExtractExifDateTime(await file.arrayBuffer());
};
