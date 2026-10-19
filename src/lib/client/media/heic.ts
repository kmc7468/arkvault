// Chromium can't decode HEIC images, so they are converted to be displayed
export const convertHeic = async (blob: Blob, toType: "image/png" | "image/jpeg") => {
  const { default: heic2any } = await import("heic2any");
  return (await heic2any({ blob, toType })) as Blob;
};
