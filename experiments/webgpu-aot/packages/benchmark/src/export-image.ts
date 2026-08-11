import type { ShareCard } from "./export-cards.js";

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    }, { once: true });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("The publication figure could not be rendered."));
    }, { once: true });
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error("The publication figure could not be encoded as PNG."));
      else resolve(blob);
    }, "image/png");
  });
}

export async function downloadShareCardPng(card: ShareCard): Promise<void> {
  const image = await loadSvg(card.svg);
  const canvas = document.createElement("canvas");
  canvas.width = card.width;
  canvas.height = card.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas rendering is unavailable in this browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, card.width, card.height);
  context.drawImage(image, 0, 0, card.width, card.height);
  const png = await canvasBlob(canvas);
  const url = URL.createObjectURL(png);
  const link = document.createElement("a");
  link.href = url;
  link.download = card.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
