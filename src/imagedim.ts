/** Dependency-free pixel size + EXIF orientation for JPEG/PNG (what a browser will actually display). */
export interface ImageDim {
  width: number;
  height: number;
  /** EXIF orientation 1-8 (JPEG only). 5-8 mean browsers swap width/height. */
  orientation: number;
}

export function readImageDim(bytes: Uint8Array): ImageDim | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20), orientation: 1 };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = v.getUint16(i + 2);
    if (marker === 0xe1 && len >= 14 && String.fromCharCode(...bytes.slice(i + 4, i + 8)) === "Exif") {
      orientation = exifOrientation(v, i + 10, len - 8) ?? orientation;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: v.getUint16(i + 5), width: v.getUint16(i + 7), orientation };
    i += 2 + len;
  }
  return null;
}

function exifOrientation(v: DataView, tiff: number, size: number): number | null {
  if (tiff + 8 > v.byteLength) return null;
  const little = v.getUint16(tiff) === 0x4949;
  const ifd = tiff + v.getUint32(tiff + 4, little);
  if (ifd + 2 > v.byteLength || ifd - tiff > size) return null;
  const count = v.getUint16(ifd, little);
  for (let n = 0; n < count; n++) {
    const e = ifd + 2 + n * 12;
    if (e + 12 > v.byteLength) return null;
    if (v.getUint16(e, little) === 0x0112) return v.getUint16(e + 8, little);
  }
  return null;
}

/** Displayed size after browser EXIF handling. */
export function displayedSize(dim: ImageDim): { width: number; height: number } {
  return dim.orientation >= 5 && dim.orientation <= 8
    ? { width: dim.height, height: dim.width }
    : { width: dim.width, height: dim.height };
}
