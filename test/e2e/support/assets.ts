import type { Page } from "@playwright/test";
import { randomBytes } from "crypto";

export interface Asset {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

// Generates a 640x480 PNG image and a short WebM video in the browser
export const createMediaAssets = async (page: Page) => {
  const { png, webm } = await page.evaluate(async () => {
    const toBase64 = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer()).toBase64();

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d")!;
    const draw = (frame: number) => {
      context.fillStyle = `hsl(${(frame * 50) % 360}, 80%, 50%)`;
      context.fillRect(0, 0, 640, 480);
      context.fillStyle = "white";
      context.font = "64px sans-serif";
      context.fillText(`ArkVault ${frame}`, 40, 240);
    };

    draw(0);
    const png = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));

    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = ({ data }) => chunks.push(data);
    recorder.start();
    for (let frame = 0; frame < 30; frame++) {
      draw(frame);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    recorder.stop();
    await new Promise((resolve) => (recorder.onstop = resolve));

    return { png: await toBase64(png), webm: await toBase64(new Blob(chunks)) };
  });

  return {
    image: { name: "image.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
    video: { name: "video.webm", mimeType: "video/webm", buffer: Buffer.from(webm, "base64") },
  } satisfies Record<string, Asset>;
};

// Spans three chunks, the last of which is partial
export const createLargeAsset = (): Asset => ({
  name: "large.bin",
  mimeType: "application/octet-stream",
  buffer: randomBytes(9 * 1024 * 1024 + 123),
});
