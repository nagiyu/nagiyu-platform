import type { HighlightRepository } from '../repositories/highlight.repository.interface.js';
import type { Highlight, UpdateHighlightInput } from '../types.js';
import { DOMAIN_ERROR_MESSAGES } from './domain-error-messages.js';

export class HighlightService {
  private readonly highlightRepository: HighlightRepository;
  private readonly now: () => number;

  /**
   * @param now - 現在時刻 (ミリ秒) を返す関数。期限の判定を時刻に依存させずに確かめるため、差し替えられる
   */
  constructor(highlightRepository: HighlightRepository, now: () => number = () => Date.now()) {
    this.highlightRepository = highlightRepository;
    this.now = now;
  }

  /** TTL による削除は期限から遅れるため、期限 (expiresAt) を過ぎた見どころは見つからない扱いにする */
  private isExpired(highlight: Highlight): boolean {
    return highlight.expiresAt <= this.now();
  }

  public async getHighlights(jobId: string): Promise<Highlight[]> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    const highlights = await this.highlightRepository.getByJobId(jobId);
    return highlights.filter((highlight) => !this.isExpired(highlight));
  }

  public async getHighlight(jobId: string, highlightId: string): Promise<Highlight | null> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    if (highlightId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.HIGHLIGHT_ID_REQUIRED);
    }
    const highlight = await this.highlightRepository.getById(jobId, highlightId);
    return highlight === null || this.isExpired(highlight) ? null : highlight;
  }

  /**
   * 見どころを更新する。
   *
   * @param videoDurationSec - 動画の長さ(秒)。終了をこれより後へ動かす更新を拒否する。分からないときは渡さず、上限を見ない
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
    if (!current || this.isExpired(current)) {
      throw new Error(DOMAIN_ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND);
    }

    const nextStart = updates.startSec ?? current.startSec;
    const nextEnd = updates.endSec ?? current.endSec;
    if (nextStart >= nextEnd) {
      throw new Error(DOMAIN_ERROR_MESSAGES.RANGE_INVALID);
    }
    // 終了を動かさない更新は上限を見ない。長さを書き戻す前に作られた見どころは終了が上限を超えていることがあり、
    // その採否や開始の調整まで止めないため
    if (
      videoDurationSec !== undefined &&
      nextEnd !== current.endSec &&
      nextEnd > videoDurationSec
    ) {
      throw new Error(DOMAIN_ERROR_MESSAGES.END_EXCEEDS_DURATION);
    }

    return this.highlightRepository.update(jobId, highlightId, updates);
  }

  private isNonNegativeFiniteNumber(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
}
