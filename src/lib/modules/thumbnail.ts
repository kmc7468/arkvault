import { encodeToBase64 } from "$lib/modules/crypto";

const scaleSize = (width: number, height: number, targetSize: number) => {
  if (width <= targetSize || height <= targetSize) {
    return { width, height };
  }

  const scale = targetSize / Math.min(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

const generateImageThumbnail = (imageUrl: string) => {
  return new Promise<Blob>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const { width, height } = scaleSize(image.width, image.height, 250);

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        return reject(new Error("Failed to generate thumbnail"));
      }

      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to generate thumbnail"));
        }
      }, "image/webp");
    };
    image.onerror = reject;

    image.src = imageUrl;
  });
};

export const captureVideoThumbnail = (video: HTMLVideoElement) => {
  return new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const { width, height } = scaleSize(video.videoWidth, video.videoHeight, 250);

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return reject(new Error("Failed to generate thumbnail"));
    }

    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to generate thumbnail"));
      }
    }, "image/webp");
  });
};

const generateVideoThumbnail = (videoUrl: string, time = 0) => {
  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    video.onloadeddata = () => {
      video.currentTime = time;
    };
    video.onseeked = () => {
      captureVideoThumbnail(video).then(resolve).catch(reject);
    };
    video.onerror = reject;

    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;
  });
};

export const generateThumbnail = async (fileBuffer: ArrayBuffer, fileType: string) => {
  let url;
  try {
    if (fileType === "image/heic") {
      const { default: heic2any } = await import("heic2any");
      url = URL.createObjectURL(
        (await heic2any({
          blob: new Blob([fileBuffer], { type: fileType }),
          toType: "image/png",
        })) as Blob,
      );
      return await generateImageThumbnail(url);
    } else if (fileType.startsWith("image/")) {
      url = URL.createObjectURL(new Blob([fileBuffer], { type: fileType }));
      return await generateImageThumbnail(url);
    } else if (fileType.startsWith("video/")) {
      url = URL.createObjectURL(new Blob([fileBuffer], { type: fileType }));
      return await generateVideoThumbnail(url);
    }
    return null;
  } catch {
    return null;
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
};

export const getThumbnailUrl = (thumbnailBuffer: ArrayBuffer) => {
  return `data:image/webp;base64,${encodeToBase64(thumbnailBuffer)}`;
};
