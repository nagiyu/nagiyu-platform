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
