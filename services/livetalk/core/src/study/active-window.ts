import { STUDY_PAUSE_AFTER_HOURS } from '../constants.js';
import type { MessageEntity } from '../entities/message.entity.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';

const PAUSE_AFTER_MS = STUDY_PAUSE_AFTER_HOURS * 60 * 60 * 1000;

/**
 * 利用者 × キャラクターの勉強が止まっているかを返す。
 * 勉強 (acquire) と、重要通知・平常通知の文面選択が同じ条件を共有するための唯一の判定。
 *
 * 最後の発話からちょうど `STUDY_PAUSE_AFTER_HOURS` 経った時点で止まる。発話が一度もなければ止まっている。
 *
 * @param lastUserMessageAt ユーザーの最後の発話の時刻 (Unix ms)。発話なしは undefined
 * @param now 判定時刻
 */
export function isStudyPaused(lastUserMessageAt: number | undefined, now: Date): boolean {
  if (lastUserMessageAt === undefined) return true;
  return now.getTime() - lastUserMessageAt >= PAUSE_AFTER_MS;
}

/**
 * メッセージ列からユーザー発話の最後の時刻を返す。
 * アシスタントの発話は「話した」に含めないため role で絞る。
 */
export function findLastUserMessageAt(
  messages: Pick<MessageEntity, 'role' | 'createdAt'>[]
): number | undefined {
  let last: number | undefined;
  for (const message of messages) {
    if (message.role !== 'user') continue;
    if (last === undefined || message.createdAt > last) last = message.createdAt;
  }
  return last;
}

/**
 * メッセージ履歴からユーザーの最後の発話時刻を求める。
 *
 * 停止の判定に必要なのは「停止期間内に発話があるか」だけなので、停止期間より前は読まない。
 * `listSince` は sinceMs より後だけを返すため、ちょうど停止期間前の発話は含まれず、
 * `isStudyPaused` の境界 (経過 >= 停止期間) と一致する。
 * DynamoDB の FilterExpression は読み取り後に適用されるため、読み取り量そのものは減らない。
 */
export async function resolveLastUserMessageAt(
  messageRepo: MessageRepository,
  userId: string,
  characterId: string,
  now: Date
): Promise<number | undefined> {
  const messages = await messageRepo.listSince(userId, characterId, now.getTime() - PAUSE_AFTER_MS);
  return findLastUserMessageAt(messages);
}
