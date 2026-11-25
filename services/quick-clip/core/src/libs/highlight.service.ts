import type { HighlightRepository } from '../repositories/highlight.repository.interface.js';
import type { Highlight, UpdateHighlightInput } from '../types.js';
import { DOMAIN_ERROR_MESSAGES } from './domain-error-messages.js';

export class HighlightService {
  private readonly highlightRepository: HighlightRepository;

  constructor(highlightRepository: HighlightRepository) {
    this.highlightRepository = highlightRepository;
  }

  public async getHighlights(jobId: string): Promise<Highlight[]> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.highlightRepository.getByJobId(jobId);
  }

  public async getHighlight(jobId: string, highlightId: string): Promise<Highlight | null> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    if (highlightId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.HIGHLIGHT_ID_REQUIRED);
    }
    return this.highlightRepository.getById(jobId, highlightId);
  }

  /**
   * 見どころを更新する。
   *
   * @param videoDurationSec - 動画の長さ(秒)。時刻の更新で終了がこれを超えることを拒否する。分からないときは渡さず、上限を見ない
   */
  public async updateHighlight(
    jobId: string,
    highlightId: string,
    updates: UpdateHighlightInput,
    videoDurationSec?: number
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
    const hasClipStatus = updates.clipStatus !== undefined;
    if (!hasStart && !hasEnd && !hasStatus && !hasClipStatus) {
      throw new Error(DOMAIN_ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED);
    }

    if (hasStart && !this.isNonNegativeFiniteNumber(updates.startSec)) {
      throw new Error(DOMAIN_ERROR_MESSAGES.SECOND_VALUE_INVALID);
    }
    if (hasEnd && !this.isNonNegativeFiniteNumber(updates.endSec)) {
      throw new Error(DOMAIN_ERROR_MESSAGES.SECOND_VALUE_INVALID);
    }

    const current = await this.highlightRepository.getById(jobId, highlightId);
    if (!current) {
      throw new Error(DOMAIN_ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND);
    }

    const nextStart = updates.startSec ?? current.startSec;
    const nextEnd = updates.endSec ?? current.endSec;
    if (nextStart >= nextEnd) {
      throw new Error(DOMAIN_ERROR_MESSAGES.RANGE_INVALID);
    }
    // 時刻を変えない更新 (status のみ等) は、動画の長さを見ない
    if ((hasStart || hasEnd) && videoDurationSec !== undefined && nextEnd > videoDurationSec) {
      throw new Error(DOMAIN_ERROR_MESSAGES.END_EXCEEDS_DURATION);
    }

    return this.highlightRepository.update(jobId, highlightId, updates);
  }

  private isNonNegativeFiniteNumber(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
}
