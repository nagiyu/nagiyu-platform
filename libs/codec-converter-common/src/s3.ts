/**
 * S3 Helper for codec-converter
 * Provides utilities for S3 operations including Presigned URL generation
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Options for generating upload presigned URLs
 */
export interface UploadPresignedUrlOptions {
  /** URL expiration time in seconds (default: 3600 = 1 hour) */
  expiresIn?: number;
  /** Content-Type header to enforce for the upload */
  contentType?: string;
}

/**
 * Options for generating download presigned URLs
 */
export interface DownloadPresignedUrlOptions {
  /** URL expiration time in seconds (default: 86400 = 24 hours) */
  expiresIn?: number;
}

/**
 * S3Helper class for managing S3 operations
 */
export class S3Helper {
  private client: S3Client;
  private bucketName: string;

  constructor(bucketName: string, region?: string) {
    this.client = new S3Client({
      region: region || process.env.AWS_REGION || "us-east-1",
    });
    this.bucketName = bucketName;
  }

  /**
   * Generate a Presigned URL for uploading files to S3
   * @param key - S3 object key (e.g., "uploads/{jobId}/input.mp4")
   * @param options - Upload options including expiration and content type
   * @returns Presigned URL for PUT operation
   */
  async getUploadPresignedUrl(
    key: string,
    options: UploadPresignedUrlOptions = {},
  ): Promise<string> {
    const { expiresIn = 3600, contentType } = options;

    const commandParams: {
      Bucket: string;
      Key: string;
      ContentType?: string;
    } = {
      Bucket: this.bucketName,
      Key: key,
    };

    if (contentType) {
      commandParams.ContentType = contentType;
    }

    const command = new PutObjectCommand(commandParams);
    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Generate a Presigned URL for downloading files from S3
   * @param key - S3 object key (e.g., "outputs/{jobId}/output.mp4")
   * @param options - Download options including expiration
   * @returns Presigned URL for GET operation
   */
  async getDownloadPresignedUrl(
    key: string,
    options: DownloadPresignedUrlOptions = {},
  ): Promise<string> {
    const { expiresIn = 86400 } = options;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Get the S3 bucket name
   * @returns S3 bucket name
   */
  getBucketName(): string {
    return this.bucketName;
  }

  /**
   * Get the S3 client instance
   * @returns S3Client instance
   */
  getClient(): S3Client {
    return this.client;
  }
}
