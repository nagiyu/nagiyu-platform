/**
 * ジョブステータス
 */
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * コーデックタイプ
 */
export type CodecType = 'h264' | 'vp9' | 'av1';

/**
 * ジョブ情報
 */
export interface Job {
  /** ジョブID (UUID v4) */
  jobId: string;
  /** ジョブステータス */
  status: JobStatus;
  /** 入力ファイルのS3キー (uploads/{jobId}/input.mp4) */
  inputFile: string;
  /** 出力ファイルのS3キー (outputs/{jobId}/output.{ext}) */
  outputFile?: string;
  /** 出力コーデック */
  outputCodec: CodecType;
  /** 元ファイル名 */
  fileName: string;
  /** ファイルサイズ (バイト) */
  fileSize: number;
  /** 作成日時 (Unix timestamp 秒) */
  createdAt: number;
  /** 更新日時 (Unix timestamp 秒) */
  updatedAt: number;
  /** 有効期限 (Unix timestamp 秒, TTL用) */
  expiresAt: number;
  /** エラーメッセージ (FAILED時のみ) */
  errorMessage?: string;
}
