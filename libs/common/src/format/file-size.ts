/**
 * ファイルサイズを人間が読める形式にフォーマットする。
 * 1 MB 未満は KB、それ以上は MB として小数点第 1 位まで表示する。
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
