/**
 * 楽観ロック競合エラー（リブトーク知識再設計 P1 / #3697）。
 *
 * `TopicRepository.putTopic` / `ConsolidationCursorRepository.put` の
 * `expectedUpdatedAt` 指定更新で `ConditionalCheckFailedException` を捕捉した際に投げる。
 * 忘却の要約再生成と consolidation の書き込み競合を、呼び出し側が
 * `error.name === 'OptimisticLockError'` で判別できるようにするための専用エラー。
 */

const ERROR_MESSAGES = {
  OPTIMISTIC_LOCK_CONFLICT: '楽観ロック競合により更新できませんでした',
} as const;

export class OptimisticLockError extends Error {
  constructor(entityType: string, identifier: string) {
    super(`${ERROR_MESSAGES.OPTIMISTIC_LOCK_CONFLICT}: ${entityType}=${identifier}`);
    this.name = 'OptimisticLockError';
  }
}
