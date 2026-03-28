import type { HighlightRepository } from '../repositories/highlight.repository.interface.js';
import type { Highlight, UpdateHighlightInput } from '../types.js';

const ERROR_MESSAGES = {
  JOB_ID_REQUIRED: 'ジョブIDは必須です',
  HIGHLIGHT_ID_REQUIRED: '見どころIDは必須です',
  UPDATE_FIELDS_REQUIRED: '更新内容が指定されていません',
  SECOND_VALUE_INVALID: '開始時刻と終了時刻は0以上で指定してください',
  RANGE_INVALID: '開始時刻は終了時刻より小さくしてください',
  HIGHLIGHT_NOT_FOUND: '見どころが見つかりません',
} as const;

export class HighlightService {
  private readonly highlightRepository: HighlightRepository;

  constructor(highlightRepository: HighlightRepository) {
    this.highlightRepository = highlightRepository;
  }

  public async getHighlights(jobId: string): Promise<Highlight[]> {
    if (jobId.trim().length === 0) {
      throw new Error(ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.highlightRepository.getByJobId(jobId);
  }

  public async updateHighlight(
    jobId: string,
    highlightId: string,
    updates: UpdateHighlightInput
  ): Promise<Highlight> {
    if (jobId.trim().length === 0) {
      throw new Error(ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    if (highlightId.trim().length === 0) {
      throw new Error(ERROR_MESSAGES.HIGHLIGHT_ID_REQUIRED);
    }

    const hasStart = updates.startSec !== undefined;
    const hasEnd = updates.endSec !== undefined;
    const hasStatus = updates.status !== undefined;
    if (!hasStart && !hasEnd && !hasStatus) {
      throw new Error(ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED);
    }

    const startSec = updates.startSec;
    if (hasStart && (startSec === undefined || !Number.isFinite(startSec) || startSec < 0)) {
      throw new Error(ERROR_MESSAGES.SECOND_VALUE_INVALID);
    }
    const endSec = updates.endSec;
    if (hasEnd && (endSec === undefined || !Number.isFinite(endSec) || endSec < 0)) {
      throw new Error(ERROR_MESSAGES.SECOND_VALUE_INVALID);
    }

    const current = await this.highlightRepository.getById(jobId, highlightId);
    if (!current) {
      throw new Error(ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND);
    }

    let nextStart = current.startSec;
    if (hasStart && startSec !== undefined) {
      nextStart = startSec;
    }

    let nextEnd = current.endSec;
    if (hasEnd && endSec !== undefined) {
      nextEnd = endSec;
    }
    if (nextStart >= nextEnd) {
      throw new Error(ERROR_MESSAGES.RANGE_INVALID);
    }

    return this.highlightRepository.update(jobId, highlightId, updates);
  }
}
