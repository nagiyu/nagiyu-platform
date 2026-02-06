import { CodecType } from './types.js';

/**
 * ジョブ定義サイズ
 */
export type JobDefinitionSize = 'small' | 'medium' | 'large' | 'xlarge';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_FILE_SIZE: 'ファイルサイズが不正です',
  INVALID_CODEC_TYPE: 'コーデックタイプが不正です',
} as const;

/**
 * ファイルサイズ閾値（バイト）
 */
const FILE_SIZE_THRESHOLDS = {
  SMALL: 100 * 1024 * 1024, // 100MB
  MEDIUM: 300 * 1024 * 1024, // 300MB
} as const;

/**
 * ファイルサイズと出力コーデックに基づいて適切なジョブ定義サイズを決定
 *
 * @param fileSize - ファイルサイズ（バイト）
 * @param codecType - 出力コーデックタイプ
 * @returns ジョブ定義サイズ
 * @throws {Error} ファイルサイズが負の場合、またはコーデックタイプが不正な場合
 *
 * @example
 * ```typescript
 * // 小ファイル + H.264 → small
 * selectJobDefinition(50 * 1024 * 1024, 'h264'); // 'small'
 *
 * // 大ファイル + AV1 → xlarge
 * selectJobDefinition(400 * 1024 * 1024, 'av1'); // 'xlarge'
 * ```
 */
export function selectJobDefinition(
  fileSize: number,
  codecType: CodecType
): JobDefinitionSize {
  // バリデーション: ファイルサイズ
  if (fileSize < 0) {
    throw new Error(ERROR_MESSAGES.INVALID_FILE_SIZE);
  }

  // バリデーション: コーデックタイプ
  const validCodecs: CodecType[] = ['h264', 'vp9', 'av1'];
  if (!validCodecs.includes(codecType)) {
    throw new Error(ERROR_MESSAGES.INVALID_CODEC_TYPE);
  }

  // リソース選択ロジック
  // Phase 1 で確定したリソース構成表に基づく
  if (fileSize < FILE_SIZE_THRESHOLDS.SMALL) {
    // < 100MB
    switch (codecType) {
      case 'h264':
        return 'small'; // 1 vCPU, 2048 MB
      case 'vp9':
        return 'small'; // 1 vCPU, 4096 MB
      case 'av1':
        return 'medium'; // 2 vCPU, 4096 MB
    }
  } else if (fileSize < FILE_SIZE_THRESHOLDS.MEDIUM) {
    // 100-300MB
    switch (codecType) {
      case 'h264':
        return 'medium'; // 2 vCPU, 4096 MB
      case 'vp9':
        return 'large'; // 4 vCPU, 8192 MB
      case 'av1':
        return 'large'; // 4 vCPU, 8192 MB
    }
  } else {
    // > 300MB
    switch (codecType) {
      case 'h264':
        return 'medium'; // 2 vCPU, 4096 MB
      case 'vp9':
        return 'large'; // 4 vCPU, 8192 MB
      case 'av1':
        return 'xlarge'; // 4 vCPU, 16384 MB
    }
  }
}
