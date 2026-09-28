/**
 * Stock Tracker Core - ModelSnapshot Repository Interface
 *
 * その日の算出に使った重み・基準値・中立帯・成績データの操作インターフェース
 */
import type { Market, ModelSnapshotItem, Question } from '../forecast/index.js';

/** `createIfAbsent` の結果。`created: false` は既に存在し、書き込まなかったことを示す */
export interface CreateModelSnapshotResult {
  item: ModelSnapshotItem;
  created: boolean;
}

/**
 * ModelSnapshot Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース。
 * ModelSnapshot は一度書いたら書き換えないため、条件付き作成のみを持つ（更新・削除は無い）。
 */
export interface ModelSnapshotRepository {
  /**
   * ModelSnapshot を条件付きで新規作成する（`attribute_not_exists(PK)`）。
   * 既に存在する場合は書き込まず、既存のアイテムを `created: false` で返す。
   */
  createIfAbsent(item: ModelSnapshotItem): Promise<CreateModelSnapshotResult>;

  /**
   * 問い・市場・日付で単一の ModelSnapshot を取得
   *
   * @returns ModelSnapshot（存在しない場合は null）
   */
  getByDate(question: Question, market: Market, date: string): Promise<ModelSnapshotItem | null>;

  /**
   * 問い・市場について、指定日より前の最新の ModelSnapshot を取得する
   * （重みの更新時に「直前の中立帯」を引き継ぐために使う）。
   *
   * @param date - この日付より前（未満）のスナップショットを探す
   * @returns 最新の ModelSnapshot（無ければ null）
   */
  getLatestBefore(
    question: Question,
    market: Market,
    date: string
  ): Promise<ModelSnapshotItem | null>;
}
