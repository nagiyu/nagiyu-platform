import type { PocHighlight, PocJob, HighlightStatus } from '@/lib/poc-types';

type PocJobRecord = {
  job: PocJob;
  pollCount: number;
  highlights: PocHighlight[];
};

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const jobs = new Map<string, PocJobRecord>();

const EMPTY_ZIP_DATA_URL = 'data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==';

const createDefaultHighlights = (jobId: string): PocHighlight[] => [
  {
    highlightId: `${jobId}-h1`,
    jobId,
    order: 1,
    startSec: 12,
    endSec: 22,
    status: 'accepted',
  },
  {
    highlightId: `${jobId}-h2`,
    jobId,
    order: 2,
    startSec: 45,
    endSec: 58,
    status: 'accepted',
  },
  {
    highlightId: `${jobId}-h3`,
    jobId,
    order: 3,
    startSec: 85,
    endSec: 95,
    status: 'pending',
  },
];

const generateJobId = (): string => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) {
    return cryptoApi.randomUUID();
  }
  // WARNING(PoC): 暗号学的に安全ではないフォールバック。Phase 5 で UUID 実装に置き換える
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createPocJob = (originalFileName: string, fileSize: number): PocJob => {
  const now = Math.floor(Date.now() / 1000);
  const jobId = generateJobId();
  const job: PocJob = {
    jobId,
    status: 'PENDING',
    originalFileName,
    fileSize,
    createdAt: now,
    expiresAt: now + ONE_DAY_IN_SECONDS,
  };

  jobs.set(jobId, {
    job,
    pollCount: 0,
    highlights: createDefaultHighlights(jobId),
  });

  return { ...job };
};

export const getPocJob = (jobId: string): PocJob | null => {
  const record = jobs.get(jobId);
  if (!record) {
    return null;
  }

  record.pollCount += 1;
  if (record.job.status === 'PENDING') {
    record.job.status = 'PROCESSING';
  } else if (record.job.status === 'PROCESSING' && record.pollCount >= 3) {
    record.job.status = 'COMPLETED';
  }

  return { ...record.job };
};

export const getPocHighlights = (jobId: string): PocHighlight[] | null => {
  const record = jobs.get(jobId);
  if (!record) {
    return null;
  }
  return record.highlights.map((highlight) => ({ ...highlight }));
};

export const updatePocHighlight = (
  jobId: string,
  highlightId: string,
  values: {
    startSec?: number;
    endSec?: number;
    status?: HighlightStatus;
  }
): PocHighlight | null => {
  const record = jobs.get(jobId);
  if (!record) {
    return null;
  }

  const highlight = record.highlights.find((item) => item.highlightId === highlightId);
  if (!highlight) {
    return null;
  }

  if (typeof values.startSec === 'number') {
    highlight.startSec = values.startSec;
  }

  if (typeof values.endSec === 'number') {
    highlight.endSec = values.endSec;
  }

  if (typeof values.status === 'string') {
    highlight.status = values.status;
  }

  return { ...highlight };
};

export const getPocDownloadUrl = (jobId: string): string | null => {
  const record = jobs.get(jobId);
  if (!record) {
    return null;
  }

  const acceptedCount = record.highlights.filter(
    (highlight) => highlight.status === 'accepted'
  ).length;
  if (acceptedCount === 0) {
    return null;
  }

  return EMPTY_ZIP_DATA_URL;
};
