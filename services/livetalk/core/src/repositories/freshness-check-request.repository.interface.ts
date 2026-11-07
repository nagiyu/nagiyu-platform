import type {
  FreshnessCheckRequestEntity,
  FreshnessCheckRequestKey,
  PutFreshnessCheckRequestInput,
} from '../entities/freshness-check-request.entity.js';

export interface FreshnessCheckRequestRepository {
  /**
   * 依頼を記録する。同じ Topic の依頼が既にあれば何もせず既存を返す (冪等)。
   * 上書きすると依頼時刻が新しくなり、よく使われる Topic ほど処理順が後ろに回って確認が先送りされ続けるため、
   * 最初の依頼を残す。
   */
  put(input: PutFreshnessCheckRequestInput): Promise<FreshnessCheckRequestEntity>;
  /** キャラ単位で依頼を依頼時刻の古い順に返す */
  listByCharacter(userId: string, characterId: string): Promise<FreshnessCheckRequestEntity[]>;
  /** 依頼を消す。存在しなくても成功する */
  delete(key: FreshnessCheckRequestKey): Promise<void>;
}
