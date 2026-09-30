export function guessMime(filename: string, data: Uint8Array): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "image/png";
  }
  const head = new TextDecoder("utf-8", { fatal: false }).decode(data.slice(0, 160)).trimStart();
  if (head.startsWith("<svg") || head.includes("<svg")) return "image/svg+xml";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
