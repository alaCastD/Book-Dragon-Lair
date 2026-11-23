// Website version of covers.ts. A browser can't save files the way the phone
// does, so downloaded covers are shown from their web address (the browser
// caches them), and your own photos are stored inside the library as data.

/** No download needed on the website: the cover's own address is used. */
export async function downloadCover(url: string, _bookId: number): Promise<string | null> {
  return url;
}

export function deleteCoverFile(_uri: string | null): void {
  // Nothing to delete: photos live inside the library itself.
}

async function toDataUrl(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function saveCoverPhoto(sourceUri: string, _bookId: number): Promise<string> {
  return toDataUrl(sourceUri);
}

export async function readCoverBase64(uri: string): Promise<string | null> {
  const m = /^data:[^;,]+;base64,(.*)$/.exec(uri);
  return m ? m[1] : null;
}

export async function writeCoverBase64(base64: string, _bookId: number): Promise<string> {
  return `data:image/jpeg;base64,${base64}`;
}
