import { toErrorMessage } from '../api/error-utils.js';

/** 例外から組み立てる ErrorEvent の context 項目 */
export interface ErrorContext {
  errorName: string;
  errorMessage: string;
  /** Error のときだけ含める。Error 以外ではキー自体を持たない */
  errorStack?: string;
}

/**
 * 例外から ErrorEvent の context に入れる項目を組み立てる。
 *
 * 報告箇所ごとに手書きすると項目がばらつき、Admin で同じ観点で調べられなくなるため、
 * 3 項目の組み立てをここに集約する。Error 以外は stack を持たないので errorStack を省く。
 */
export function buildErrorContext(error: unknown): ErrorContext {
  const context: ErrorContext = {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: toErrorMessage(error),
  };
  if (error instanceof Error && error.stack !== undefined) {
    context.errorStack = error.stack;
  }
  return context;
}
