import { randomUUID } from 'node:crypto';
import type { Highlight, HighlightStatus, Job, UpdateHighlightInput } from '@/types/quick-clip';
import type { HighlightRepository, JobRepository } from '@/types/repository';

export const DOMAIN_ERROR_MESSAGES = {
  JOB_ID_REQUIRED: 'ジョブIDは必須です',
  JOB_NOT_FOUND: 'ジョブが見つかりません',
  JOB_UPDATED_FETCH_FAILED: 'ジョブの更新後の取得に失敗しました',
  FILE_NAME_REQUIRED: 'ファイル名は必須です',
  FILE_SIZE_INVALID: 'ファイルサイズは0より大きい必要があります',
  HIGHLIGHT_ID_REQUIRED: '見どころIDは必須です',
  UPDATE_FIELDS_REQUIRED: '更新内容が指定されていません',
  SECOND_VALUE_INVALID: '開始時刻と終了時刻は0以上で指定してください',
  RANGE_INVALID: '開始時刻は終了時刻より小さくしてください',
  HIGHLIGHT_NOT_FOUND: '見どころが見つかりません',
  HIGHLIGHT_UPDATED_FETCH_FAILED: '見どころの更新後の取得に失敗しました',
} as const;

const JOB_TTL_SECONDS = 24 * 60 * 60;

export class JobDomainService {
  private readonly repository: JobRepository;

  constructor(repository: JobRepository) {
    this.repository = repository;
  }

  public async createJob(input: { originalFileName: string; fileSize: number }): Promise<Job> {
    const originalFileName = input.originalFileName.trim();
    if (originalFileName.length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.FILE_NAME_REQUIRED);
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.FILE_SIZE_INVALID);
    }

    const createdAt = Math.floor(Date.now() / 1000);
    const job: Job = {
      jobId: randomUUID(),
      status: 'PENDING',
      originalFileName,
      fileSize: input.fileSize,
      createdAt,
      expiresAt: createdAt + JOB_TTL_SECONDS,
    };

    return this.repository.create(job);
  }

  public async getJob(jobId: string): Promise<Job | null> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.repository.getById(jobId);
  }
}

export class HighlightDomainService {
  private readonly repository: HighlightRepository;

  constructor(repository: HighlightRepository) {
    this.repository = repository;
  }

  public async getHighlights(jobId: string): Promise<Highlight[]> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.repository.getByJobId(jobId);
  }

  public async updateHighlight(
    jobId: string,
    highlightId: string,
    updates: UpdateHighlightInput
  ): Promise<Highlight> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    if (highlightId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.HIGHLIGHT_ID_REQUIRED);
    }

    const hasStart = updates.startSec !== undefined;
    const hasEnd = updates.endSec !== undefined;
    const hasStatus = updates.status !== undefined;
    if (!hasStart && !hasEnd && !hasStatus) {
      throw new Error(DOMAIN_ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED);
    }

    if (hasStart && !this.isNonNegativeFiniteNumber(updates.startSec)) {
      throw new Error(DOMAIN_ERROR_MESSAGES.SECOND_VALUE_INVALID);
    }
    if (hasEnd && !this.isNonNegativeFiniteNumber(updates.endSec)) {
      throw new Error(DOMAIN_ERROR_MESSAGES.SECOND_VALUE_INVALID);
    }

    const current = await this.repository.getById(jobId, highlightId);
    if (!current) {
      throw new Error(DOMAIN_ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND);
    }

    const nextStart = updates.startSec ?? current.startSec;
    const nextEnd = updates.endSec ?? current.endSec;
    if (nextStart >= nextEnd) {
      throw new Error(DOMAIN_ERROR_MESSAGES.RANGE_INVALID);
    }

    return this.repository.update(jobId, highlightId, updates);
  }

  // 秒指定の入力値が「数値かつ有限値かつ0以上」であることを判定する型ガード。
  private isNonNegativeFiniteNumber(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
}

export const isHighlightStatus = (value: unknown): value is HighlightStatus =>
  value === 'accepted' || value === 'rejected' || value === 'pending';
