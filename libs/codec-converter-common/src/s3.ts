/**
 * S3 Helper for codec-converter
 * Provides utilities for S3 operations including Presigned URL generation
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3Helper class for managing S3 operations
 */
export class S3Helper {
  private client: S3Client;
  private bucketName: string;

  constructor(bucketName: string, region?: string) {
    this.client = new S3Client({ region: region || process.env.AWS_REGION || 'us-east-1' });
    this.bucketName = bucketName;
  }

  /**
   * Generate a Presigned URL for uploading files to S3
   * @param key - S3 object key (e.g., "uploads/{jobId}/input.mp4")
   * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
   * @returns Presigned URL for PUT operation
   */
  async getUploadPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Generate a Presigned URL for downloading files from S3
   * @param key - S3 object key (e.g., "outputs/{jobId}/output.mp4")
   * @param expiresIn - URL expiration time in seconds (default: 86400 = 24 hours)
   * @returns Presigned URL for GET operation
   */
  async getDownloadPresignedUrl(key: string, expiresIn: number = 86400): Promise<string> {
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
