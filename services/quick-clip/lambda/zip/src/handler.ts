import { withErrorReporting, getS3Client } from '@nagiyu/aws';
import { requireEnv } from '@nagiyu/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import JSZip from 'jszip';

const ERROR_MESSAGES = {
  INVALID_INPUT: '入力値が不正です',
  CLIP_NOT_FOUND: 'クリップファイルが見つかりません',
} as const;

const CLIP_KEY = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;
const TRANSCRIPT_KEY = (jobId: string): string => `outputs/${jobId}/transcript.json`;
const ZIP_KEY = (jobId: string): string => `outputs/${jobId}/clips.zip`;

/** ZIP イベント内の1クリップ情報。 */
export type ClipInput = {
  highlightId: string;
  order: number;
  startSec: number;
  endSec: number;
};

export type ZipGeneratorEvent = {
  jobId: string;
  clips: ClipInput[];
};

export type ZipGeneratorResult = {
  downloadUrl: string;
};

/** 文字起こしの1セグメント。 */
type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type S3Error = {
  name?: string;
  Code?: string;
};

const isNoSuchKeyError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const s3Error = error as S3Error;
  return s3Error.name === 'NoSuchKey' || s3Error.Code === 'NoSuchKey';
};

/** order を2桁ゼロ埋めに変換する。例: 1 → "01" */
const padOrder = (order: number): string => String(order).padStart(2, '0');

const validateEnvironment = (): { bucketName: string; awsRegion: string } => {
  const env = requireEnv(['S3_BUCKET', 'AWS_REGION']);
  return { bucketName: env.S3_BUCKET, awsRegion: env.AWS_REGION };
};

const validateEvent = (event: ZipGeneratorEvent): void => {
  if (!event.jobId || !Array.isArray(event.clips) || event.clips.length === 0) {
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

/**
 * transcript.json を S3 から取得して JSON パースする。
 * ファイルが存在しない場合は null を返す（オプショナル扱い）。
 */
const fetchTranscriptSegments = async (
  s3Client: S3Client,
  bucketName: string,
  jobId: string
): Promise<TranscriptSegment[] | null> => {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: TRANSCRIPT_KEY(jobId),
      })
    );
    if (!response.Body) {
      return null;
    }
    const rawText = await response.Body.transformToString();
    return JSON.parse(rawText) as TranscriptSegment[];
  } catch (error) {
    if (isNoSuchKeyError(error)) {
      return null;
    }
    throw error;
  }
};

/**
 * クリップ時間範囲に重なるセグメントのテキストを改行で連結する。
 * 重なる条件: seg.start < endSec && seg.end > startSec
 */
const buildClipText = (segments: TranscriptSegment[], startSec: number, endSec: number): string => {
  return segments
    .filter((seg) => seg.start < endSec && seg.end > startSec)
    .map((seg) => seg.text)
    .join('\n');
};

const buildZipBuffer = async (
  s3Client: S3Client,
  bucketName: string,
  event: ZipGeneratorEvent
): Promise<Buffer> => {
  const zip = new JSZip();

  // 文字起こしデータを1回だけ取得する（NoSuchKey の場合は null）
  const segments = await fetchTranscriptSegments(s3Client, bucketName, event.jobId);

  const clipEntries = await Promise.all(
    event.clips.map(async (clip) => {
      const bytes = await getClipBuffer(s3Client, bucketName, event.jobId, clip.highlightId);
      return {
        order: clip.order,
        startSec: clip.startSec,
        endSec: clip.endSec,
        bytes,
      };
    })
  );

  for (const entry of clipEntries) {
    const pad = padOrder(entry.order);

    // 動画ファイルを追加
    zip.file(`clip-${pad}.mp4`, entry.bytes);

    // テキストファイルを追加（セグメントあり、かつ非空の場合のみ）
    if (segments !== null) {
      const text = buildClipText(segments, entry.startSec, entry.endSec);
      if (text.length > 0) {
        zip.file(`clip-${pad}.txt`, text);
      }
    }
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
  const s3Client = getS3Client(awsRegion);
  const result = await withErrorReporting(
    {
      serviceId: 'quick-clip',
      severity: 'error',
      title: 'QuickClip ZIP 生成に失敗しました',
      context: {
        jobId: event.jobId,
        clips: event.clips,
        s3Key: ZIP_KEY(event.jobId),
      },
    },
    async () => {
      const zipBuffer = await buildZipBuffer(s3Client, bucketName, event);
      await uploadZip(s3Client, bucketName, event, zipBuffer);
      const downloadUrl = await createDownloadUrl(s3Client, bucketName, event);
      return { downloadUrl };
    }
  );
  return result!;
};
