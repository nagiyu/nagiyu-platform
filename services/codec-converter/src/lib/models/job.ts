/**
 * Job model for Codec Converter
 *
 * This model represents a video conversion job in the system.
 * Jobs are persisted in DynamoDB table: codec-converter-jobs-{env}
 * 
 * Note: Job and JobStatus types are imported from the common library
 * to ensure consistency across the codec-converter service.
 */

import { Job, JobStatus } from '@nagiyu/codec-converter-common';

/**
 * Re-export Job and JobStatus from common library for convenience
 */
export type { Job, JobStatus };

/**
 * Output codec enumeration
 * Supported output codecs for video conversion
 */
export type OutputCodec = 'h264' | 'vp9' | 'av1';

/**
 * Create a new Job instance with default values
 *
 * @param params - Partial job parameters
 * @returns A complete Job object with calculated fields
 *
 * @example
 * const job = createJob({
 *   jobId: '550e8400-e29b-41d4-a716-446655440000',
 *   inputFile: 'uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4',
 *   outputCodec: 'h264',
 *   fileName: 'my-video.mp4',
 *   fileSize: 1024000
 * });
 */
export function createJob(params: {
  jobId: string;
  inputFile: string;
  outputCodec: OutputCodec;
  fileName: string;
  fileSize: number;
}): Job {
  const now = Math.floor(Date.now() / 1000); // epoch seconds

  return {
    jobId: params.jobId,
    status: JobStatus.PENDING,
    inputFile: params.inputFile,
    outputCodec: params.outputCodec,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 86400, // 24 hours (86400 seconds) after creation
    fileName: params.fileName,
    fileSize: params.fileSize,
  };
}

/**
 * Validation constants
 */
export const JobValidation = {
  /** Maximum file size in bytes (500MB) */
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 524,288,000 bytes

  /** Job expiration time in seconds (24 hours) */
  EXPIRATION_SECONDS: 86400,

  /** Valid job statuses */
  VALID_STATUSES: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const,

  /** Valid output codecs */
  VALID_CODECS: ['h264', 'vp9', 'av1'] as const,
} as const;

/**
 * Type guard to check if a status is valid
 * @param status - The status to check
 * @returns true if the status is a valid JobStatus
 */
export function isValidJobStatus(status: string): status is JobStatus {
  return JobValidation.VALID_STATUSES.indexOf(status as JobStatus) !== -1;
}

/**
 * Type guard to check if a codec is valid
 * @param codec - The codec to check
 * @returns true if the codec is a valid OutputCodec
 */
export function isValidOutputCodec(codec: string): codec is OutputCodec {
  return JobValidation.VALID_CODECS.indexOf(codec as OutputCodec) !== -1;
}
