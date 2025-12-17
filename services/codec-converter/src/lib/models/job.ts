/**
 * Job model for Codec Converter
 *
 * This model represents a video conversion job in the system.
 * Jobs are persisted in DynamoDB table: codec-converter-jobs-{env}
 */

/**
 * Job status enumeration
 * - PENDING: Job is created and waiting to be processed
 * - PROCESSING: Job is currently being processed by a worker
 * - COMPLETED: Job has been successfully completed
 * - FAILED: Job has failed due to an error
 */
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Output codec enumeration
 * Supported output codecs for video conversion
 */
export type OutputCodec = 'h264' | 'vp9' | 'av1';

/**
 * Job entity
 * Represents a video conversion job with all necessary metadata
 */
export interface Job {
  /**
   * Unique job identifier (UUID v4)
   * Example: '550e8400-e29b-41d4-a716-446655440000'
   * DynamoDB: Primary Key (PK)
   */
  jobId: string;

  /**
   * Current status of the job
   * State transitions: PENDING -> PROCESSING -> COMPLETED/FAILED
   */
  status: JobStatus;

  /**
   * S3 path to the input file
   * Format: 'uploads/{jobId}/input.mp4'
   */
  inputFile: string;

  /**
   * S3 path to the output file (optional, available after completion)
   * Format: 'outputs/{jobId}/output.{mp4|webm}'
   */
  outputFile?: string;

  /**
   * Desired output codec for the conversion
   */
  outputCodec: OutputCodec;

  /**
   * Timestamp when the job was created (epoch seconds)
   * Used as base for calculating expiresAt
   */
  createdAt: number;

  /**
   * Timestamp when the job was last updated (epoch seconds)
   * Updated on status changes
   */
  updatedAt: number;

  /**
   * Timestamp when the job record expires (epoch seconds)
   * DynamoDB TTL field
   * Calculated as: createdAt + 86400 (24 hours after creation)
   */
  expiresAt: number;

  /**
   * Original filename uploaded by the user
   */
  fileName: string;

  /**
   * File size in bytes
   * Validation: Must be <= 500MB (524,288,000 bytes)
   */
  fileSize: number;

  /**
   * Error message (optional, populated when status is FAILED)
   * Contains details about why the job failed
   */
  errorMessage?: string;
}

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
    status: 'PENDING',
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
 * Type guard to check if a status is valid
 * @param status - The status to check
 * @returns true if the status is a valid JobStatus
 */
export function isValidJobStatus(status: string): status is JobStatus {
  const validStatuses: string[] = [
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
  ];
  return validStatuses.indexOf(status) !== -1;
}

/**
 * Type guard to check if a codec is valid
 * @param codec - The codec to check
 * @returns true if the codec is a valid OutputCodec
 */
export function isValidOutputCodec(codec: string): codec is OutputCodec {
  const validCodecs: string[] = ['h264', 'vp9', 'av1'];
  return validCodecs.indexOf(codec) !== -1;
}

/**
 * Validation constants
 */
export const JobValidation = {
  /** Maximum file size in bytes (500MB) */
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 524,288,000 bytes

  /** Job expiration time in seconds (24 hours) */
  EXPIRATION_SECONDS: 86400,
} as const;
