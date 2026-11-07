import type {
  FreshnessCheckRequestEntity,
  FreshnessCheckRequestKey,
  PutFreshnessCheckRequestInput,
} from '../entities/freshness-check-request.entity.js';

export interface FreshnessCheckRequestRepository {
  /** 依頼を記録する。同じ Topic の依頼があれば上書きする (冪等) */
  put(input: PutFreshnessCheckRequestInput): Promise<FreshnessCheckRequestEntity>;
  /** キャラ単位で依頼を依頼時刻の古い順に返す */
  listByCharacter(userId: string, characterId: string): Promise<FreshnessCheckRequestEntity[]>;
  /** 依頼を消す。存在しなくても成功する */
  delete(key: FreshnessCheckRequestKey): Promise<void>;
}
