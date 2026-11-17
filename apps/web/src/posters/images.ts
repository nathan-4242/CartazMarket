import type { PosterImage } from "./draft";

export async function importImage(file: File): Promise<PosterImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("Este formato não pôde ser aberto. Converta o arquivo para PNG, JPG ou WebP e tente novamente.");
    });
    const ratio = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      id: crypto.randomUUID(), name: file.name, source: canvas.toDataURL("image/png"),
      width: 160 * image.naturalWidth / Math.max(image.naturalWidth, image.naturalHeight),
      height: 160 * image.naturalHeight / Math.max(image.naturalWidth, image.naturalHeight),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
