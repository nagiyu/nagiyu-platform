import type {
  ExplorationEntity,
  ExplorationKey,
  PutExplorationInput,
} from '../entities/exploration.entity.js';

/**
 * 自発リサーチの探索の記録のリポジトリ。
 */
export interface ExplorationRepository {
  /** 記録を保存する。既にあれば上書きする。 */
  put(input: PutExplorationInput): Promise<ExplorationEntity>;
  /** キャラ単位の記録を全件返す (候補ごとの読み取りを避けるため 1 回でまとめて読む)。 */
  listAll(userId: string, characterId: string): Promise<ExplorationEntity[]>;
  /** 記録を削除する。無くても成功する。 */
  delete(key: ExplorationKey): Promise<void>;
}
