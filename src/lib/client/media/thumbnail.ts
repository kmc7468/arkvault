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

const capture = (
  width: number,
  height: number,
  drawer: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  targetSize = 250,
) => {
  return new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const { width: scaledWidth, height: scaledHeight } = scaleSize(width, height, targetSize);

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return reject(new Error("Failed to generate thumbnail"));
    }

    drawer(context, scaledWidth, scaledHeight);
    canvas.toBlob((blob) => {
      if (blob && blob.type === "image/webp") {
        resolve(blob);
      } else {
        reject(new Error("Failed to generate thumbnail"));
      }
    }, "image/webp");
  });
};

const generateImageThumbnail = (imageUrl: string) => {
  return new Promise<Blob>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      capture(image.width, image.height, (context, width, height) => {
        context.drawImage(image, 0, 0, width, height);
      })
        .then(resolve)
        .catch(reject);
    };
    image.onerror = reject;
    image.src = imageUrl;
  });
};

export const captureVideoThumbnail = (video: HTMLVideoElement) => {
  return capture(video.videoWidth, video.videoHeight, (context, width, height) => {
    context.drawImage(video, 0, 0, width, height);
  });
};

const VIDEO_THUMBNAIL_TIMEOUT_MS = 30_000;

const generateVideoThumbnail = (videoUrl: string, time = 0) => {
  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    let isCaptured = false;

    const cleanup = () => {
      clearTimeout(timeout);
      video.onloadedmetadata = video.onloadeddata = video.onseeked = video.onerror = null;
      video.removeAttribute("src");
      video.load(); // Stops loading the video
    };
    const fail = (reason: unknown) => {
      cleanup();
      reject(reason);
    };
    const captureFrame = () => {
      if (isCaptured || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      isCaptured = true;
      captureVideoThumbnail(video).then(resolve, reject).finally(cleanup);
    };

    // Streamed videos may stall without any error
    const timeout = setTimeout(
      () => fail(new Error("Timed out while loading the video")),
      VIDEO_THUMBNAIL_TIMEOUT_MS,
    );

    video.onloadedmetadata = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        return fail(new Error("Invalid video size"));
      }

      // Frame callbacks aren't guaranteed for videos not in the document, so also wait for seeking
      video.requestVideoFrameCallback(captureFrame);
      video.onseeked = captureFrame;
      if (time === 0) {
        video.onloadeddata = captureFrame;
      }
      video.currentTime = Math.min(time, video.duration);
    };
    video.onerror = () => fail(video.error);

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;
  });
};

const convertHeicToPng = async (blob: Blob) => {
  const { default: heic2any } = await import("heic2any");
  return (await heic2any({ blob, toType: "image/png" })) as Blob;
};

// Generates a thumbnail of the image or video at the URL. Returns `null` if not supported.
export const generateThumbnailFromUrl = async (url: string, contentType: string) => {
  try {
    if (contentType.startsWith("image/")) {
      try {
        return await generateImageThumbnail(url);
      } catch {
        if (contentType !== "image/heic") return null;

        // Chromium can't decode HEIC images
        const png = URL.createObjectURL(await convertHeicToPng(await (await fetch(url)).blob()));
        try {
          return await generateImageThumbnail(png);
        } finally {
          URL.revokeObjectURL(png);
        }
      }
    } else if (contentType.startsWith("video/")) {
      return await generateVideoThumbnail(url);
    }
    return null;
  } catch {
    return null;
  }
};

export const generateThumbnail = async (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  try {
    return await generateThumbnailFromUrl(url, blob.type);
  } finally {
    URL.revokeObjectURL(url);
  }
};
