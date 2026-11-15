import "server-only";
import { cacheLife } from "next/cache";
import { dedupePhotos, imageSize, largeFirst, type PhotoSize } from "@/domain/gallery";

/** Enough of a file for its header: a JPEG's Exif block can push its frame marker past a few KB. */
const HEAD_BYTES = 64 * 1024;
const TIMEOUT_MS = 2500;
/** Only the first photos can become the main one; the rest keep their place. */
const PROBED = 8;

/**
 * A photo's size from the first bytes of the file (the CDNs answer a range request), so the page
 * can open on a large photo without loading a small one first. A file's size doesn't change, so a
 * read is kept for weeks; a failed one only for minutes.
 */
async function photoSize(url: string): Promise<PhotoSize | null> {
  "use cache";
  try {
    const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok || !res.body) throw new Error(`photo ${res.status}`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (length < HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.length;
    }
    await reader.cancel().catch(() => {});
    const bytes = new Uint8Array(length);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    const size = imageSize(bytes);
    if (size) cacheLife("weeks");
    else cacheLife("hours");
    return size;
  } catch {
    cacheLife("minutes");
    return null;
  }
}

/** The family's photos once per file name, a large one first when the first is small (`largeFirst`). */
export async function galleryPhotos(images: readonly string[]): Promise<string[]> {
  const photos = dedupePhotos(images);
  if (photos.length < 2) return photos;
  const head = photos.slice(0, PROBED);
  const sizes = await Promise.all(head.map((url) => photoSize(url)));
  return [...largeFirst(head, sizes), ...photos.slice(PROBED)];
}
