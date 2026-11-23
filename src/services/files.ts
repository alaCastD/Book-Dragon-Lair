// Saving and opening backup files. On the phone: the share sheet and the
// system file picker. (The website uses files.web.ts.)
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes text to a temporary file and opens the share sheet (Drive, email, Files…). */
export async function saveTextFile(name: string, text: string, mimeType: string, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

/** Lets the user pick a file; returns its text, or null if they cancelled. */
export async function openTextFile(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'application/octet-stream', '*/*'] });
  if (picked.canceled) return null;
  return picked.result.text();
}
