/**
 * dev-sync コピーアルゴリズム
 *
 * prod DynamoDB テーブルのデータを dev テーブルへコピーする純粋ロジック。
 * サービスの core パッケージ（mapper/entity）に依存せず、生 DynamoDB item を素通しで扱う。
 *
 * アルゴリズムの原則：
 * 1. コピー先行（upsert）→ 後から差分削除
 *    全消し先行は dev が一瞬空になる窓を作るため禁止。
 * 2. 冪等
 *    何回・いつ流しても同じ結果になる。
 * 3. prod は read-only
 *    PutItem/DeleteItem は dest にのみ発行する。
 */

import type { DynamoTableStore } from './store-adapter.js';
import type { JobConfig, CopyResult } from './types.js';
import { ERROR_MESSAGES } from './errors.js';

/**
 * コピー先テーブルが "-dev" で終わることを確認する安全ガード。
 * 終わらない場合は即 abort（Error をスロー）する。
 *
 * @param destTable - コピー先テーブル名
 * @throws {Error} コピー先テーブルが "-dev" で終わらない場合
 */
export function assertDestIsDevTable(destTable: string): void {
  if (!destTable.endsWith('-dev')) {
    throw new Error(ERROR_MESSAGES.DEST_TABLE_NOT_DEV);
  }
}

/**
 * mirror 戦略のコピー処理
 *
 * prod テーブルを PK/SK プレフィックスでスキャンし、全件を dev に upsert する。
 * delete=on の場合、prod に存在しない dev item を削除する。
 *
 * @param source - prod テーブルのストアアダプター
 * @param dest - dev テーブルのストアアダプター
 * @param config - ジョブ設定
 * @returns コピー結果
 */
export async function runMirrorCopy(
  source: DynamoTableStore,
  dest: DynamoTableStore,
  config: JobConfig
): Promise<CopyResult> {
  // 多層ガード: runCopy からも呼ばれるが、直接呼び出し時の保護のため意図的に二重チェックする。
  assertDestIsDevTable(config.destTable);

  const pkPrefix = config.scope?.pkPrefix;
  const skPrefix = config.scope?.skPrefix;

  // Phase 1: prod → dev upsert（コピー先行）
  const prodKeys = new Set<string>();
  let scanned = 0;
  let upserted = 0;

  let exclusiveStartKey: string | undefined;
  do {
    const page = await source.scan({ pkPrefix, skPrefix, exclusiveStartKey });
    exclusiveStartKey = page.lastEvaluatedKey;
    scanned += page.items.length;

    for (const item of page.items) {
      prodKeys.add(buildKey(item.PK, item.SK));
      await dest.put(item);
      upserted++;
    }
  } while (exclusiveStartKey !== undefined);

  // Phase 2: delete=on の場合のみ差分削除（prod に無い dev item を削除）
  // 2 相化: 先に dest を全件スキャンして削除対象キーを収集し、スキャン完了後にまとめて削除する。
  // ページネーション中に同一 dest へ delete を発行すると読み飛ばしが起きる可能性があるため分離。
  let deleted = 0;
  if (config.delete === 'on') {
    // 2-1 フェーズ: dest を全件スキャンして削除対象を収集
    const toDelete: Array<{ pk: string; sk: string }> = [];
    let destKey: string | undefined;
    do {
      const destPage = await dest.scan({ pkPrefix, skPrefix, exclusiveStartKey: destKey });
      destKey = destPage.lastEvaluatedKey;

      for (const item of destPage.items) {
        const key = buildKey(item.PK as string, item.SK as string);
        if (!prodKeys.has(key)) {
          toDelete.push({ pk: item.PK as string, sk: item.SK as string });
        }
      }
    } while (destKey !== undefined);

    // 2-2 フェーズ: 収集した削除対象をまとめて削除
    for (const { pk, sk } of toDelete) {
      await dest.delete(pk, sk);
      deleted++;
    }
  }

  return { upserted, deleted, scanned };
}

/**
 * gsiWindow 戦略のコピー処理
 *
 * 指定 GSI を「直近 N 日」でクエリし、結果を dev に upsert する。
 * 削除は行わない（delete=off 固定）。
 *
 * @param source - prod テーブルのストアアダプター
 * @param dest - dev テーブルのストアアダプター
 * @param config - ジョブ設定
 * @param now - 現在時刻（冪等性テスト用に外部注入可能）
 * @returns コピー結果
 */
export async function runGsiWindowCopy(
  source: DynamoTableStore,
  dest: DynamoTableStore,
  config: JobConfig,
  now: Date = new Date()
): Promise<CopyResult> {
  // 多層ガード: runCopy からも呼ばれるが、直接呼び出し時の保護のため意図的に二重チェックする。
  assertDestIsDevTable(config.destTable);

  if (!config.gsi) {
    throw new Error(ERROR_MESSAGES.GSI_CONFIG_REQUIRED);
  }

  const {
    indexName,
    pkAttributeName,
    pkValue,
    skAttributeName,
    windowDays,
    skPrefix,
    dateGranularity,
  } = config.gsi;

  // 直近 N 日の下限日付文字列を構築する
  // dateGranularity='date' の場合は日付のみ（YYYY-MM-DD）、既定は ISO 8601 日時形式
  const windowFrom = new Date(now);
  windowFrom.setDate(windowFrom.getDate() - windowDays);
  const granularity = dateGranularity ?? 'datetime';
  const dateStr =
    granularity === 'date' ? windowFrom.toISOString().slice(0, 10) : windowFrom.toISOString();
  const skFrom = `${skPrefix ?? ''}${dateStr}`;

  let scanned = 0;
  let upserted = 0;
  let exclusiveStartKey: string | undefined;

  do {
    const page = await source.queryGsi({
      indexName,
      pkAttributeName,
      pkValue,
      skAttributeName,
      skFrom,
      exclusiveStartKey,
    });
    exclusiveStartKey = page.lastEvaluatedKey;
    scanned += page.items.length;

    for (const item of page.items) {
      await dest.put(item);
      upserted++;
    }
  } while (exclusiveStartKey !== undefined);

  return { upserted, deleted: 0, scanned };
}

/**
 * ジョブ設定に従ってコピーを実行する汎用エントリポイント
 *
 * @param source - prod テーブルのストアアダプター
 * @param dest - dev テーブルのストアアダプター
 * @param config - ジョブ設定
 * @param now - 現在時刻（gsiWindow 戦略で使用。省略時は new Date()）
 * @returns コピー結果
 */
export async function runCopy(
  source: DynamoTableStore,
  dest: DynamoTableStore,
  config: JobConfig,
  now?: Date
): Promise<CopyResult> {
  // 多層ガード: 各戦略関数でも同じガードを実行するが、エントリポイントとして先行チェックする。
  assertDestIsDevTable(config.destTable);

  if (config.strategy === 'mirror') {
    return runMirrorCopy(source, dest, config);
  } else {
    return runGsiWindowCopy(source, dest, config, now);
  }
}

/**
 * PK/SK からストア内キー文字列を構築する（内部ユーティリティ）
 * PK/SK は DynamoDB テーブルの定義上 string 前提のため引数型を string に限定する。
 */
function buildKey(pk: string, sk: string): string {
  return `${pk}#${sk}`;
}
