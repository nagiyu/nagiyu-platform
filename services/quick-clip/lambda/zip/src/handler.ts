import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import JSZip from 'jszip';

const ERROR_MESSAGES = {
  MISSING_ENV: '必要な環境変数が設定されていません',
  INVALID_INPUT: '入力値が不正です',
  CLIP_NOT_FOUND: 'クリップファイルが見つかりません',
} as const;

const CLIP_KEY = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;
const ZIP_KEY = (jobId: string): string => `outputs/${jobId}/clips.zip`;

export type ZipGeneratorEvent = {
  jobId: string;
  highlightIds: string[];
};

export type ZipGeneratorResult = {
  downloadUrl: string;
};

const validateEnvironment = (): { bucketName: string; awsRegion: string } => {
  const bucketName = process.env.S3_BUCKET?.trim() ?? '';
  const awsRegion = process.env.AWS_REGION?.trim() ?? '';
  const missing: string[] = [];
  if (bucketName.length === 0) {
    missing.push('S3_BUCKET');
  }
  if (awsRegion.length === 0) {
    missing.push('AWS_REGION');
  }
  if (missing.length > 0) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: ${missing.join(', ')}`);
  }
  return { bucketName, awsRegion };
};

const validateEvent = (event: ZipGeneratorEvent): void => {
  if (!event.jobId || !Array.isArray(event.highlightIds) || event.highlightIds.length === 0) {
    throw new Error(ERROR_MESSAGES.INVALID_INPUT);
  }
};

const getClipBuffer = async (
  s3Client: S3Client,
  bucketName: string,
  jobId: string,
  highlightId: string
): Promise<Uint8Array> => {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: CLIP_KEY(jobId, highlightId),
    })
  );
  if (!response.Body) {
    throw new Error(ERROR_MESSAGES.CLIP_NOT_FOUND);
  }
  return response.Body.transformToByteArray();
};

const buildZipBuffer = async (
  s3Client: S3Client,
  bucketName: string,
  event: ZipGeneratorEvent
): Promise<Buffer> => {
  const zip = new JSZip();
  const clips = await Promise.all(
    event.highlightIds.map(async (highlightId) => {
      const bytes = await getClipBuffer(s3Client, bucketName, event.jobId, highlightId);
      return {
        fileName: `${highlightId}.mp4`,
        bytes,
      };
    })
  );
  for (const clip of clips) {
    zip.file(clip.fileName, clip.bytes);
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
};

const uploadZip = async (
  s3Client: S3Client,
  bucketName: string,
  event: ZipGeneratorEvent,
  zipBuffer: Buffer
): Promise<void> => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: ZIP_KEY(event.jobId),
      Body: zipBuffer,
      ContentLength: zipBuffer.length,
      ContentType: 'application/zip',
    })
  );
};

const createDownloadUrl = async (
  s3Client: S3Client,
  bucketName: string,
  event: ZipGeneratorEvent
): Promise<string> =>
  getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: ZIP_KEY(event.jobId),
    }),
    { expiresIn: 300 }
  );

export const handler = async (event: ZipGeneratorEvent): Promise<ZipGeneratorResult> => {
  validateEvent(event);
  const { bucketName, awsRegion } = validateEnvironment();
  const s3Client = new S3Client({ region: awsRegion });
  const zipBuffer = await buildZipBuffer(s3Client, bucketName, event);
  await uploadZip(s3Client, bucketName, event, zipBuffer);
  const downloadUrl = await createDownloadUrl(s3Client, bucketName, event);
  return { downloadUrl };
};
