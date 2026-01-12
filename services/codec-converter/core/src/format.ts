/**
 * ファイルサイズを人間が読める形式にフォーマット
 * @param bytes ファイルサイズ（バイト）
 * @returns フォーマットされた文字列（KB または MB）
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Unix timestampを日時文字列にフォーマット
 * @param timestamp Unix timestamp（秒）
 * @returns 日本語ロケールでフォーマットされた日時文字列
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * ジョブIDを短縮表示（先頭8文字 + ... + 最後4文字）
 * @param jobId ジョブID（UUID）
 * @returns 短縮表示されたジョブID
 */
export function formatJobId(jobId: string): string {
  const JOB_ID_DISPLAY_THRESHOLD = 12;
  if (jobId.length <= JOB_ID_DISPLAY_THRESHOLD) {
    return jobId;
  }
  return `${jobId.substring(0, 8)}...${jobId.substring(jobId.length - 4)}`;
}
