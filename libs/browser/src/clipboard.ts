/**
 * クリップボードからテキストを読み取る
 */
export async function readFromClipboard(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    return text;
  } catch {
    throw new Error('クリップボードの読み取りに失敗しました。手動で貼り付けてください。');
  }
}

/**
 * テキストをクリップボードに書き込む
 */
export async function writeToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error('クリップボードへの書き込みに失敗しました。');
  }
}
