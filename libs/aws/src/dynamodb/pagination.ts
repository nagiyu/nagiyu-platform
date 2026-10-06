/**
 * DynamoDB Query / Scan のページネーション共通処理
 *
 * 1 回の Query / Scan は最大 1MB までしか返さないため、LastEvaluatedKey を辿って
 * 全ページを取得する処理を集約する。
 */

import {
  QueryCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBItem } from './types.js';

/**
 * Query / Scan 共通のページ取得ループ。
 *
 * 1 ページ目は呼び出し側の input をそのまま送る。
 * 余計なキーを足すと input を厳密比較するテストが壊れるため、ExclusiveStartKey は 2 ページ目以降でのみ付与する。
 */
async function* paginate<TInput extends { ExclusiveStartKey?: Record<string, unknown> }>(
  input: TInput,
  send: (pageInput: TInput) => Promise<{
    Items?: Record<string, unknown>[];
    LastEvaluatedKey?: Record<string, unknown>;
  }>
): AsyncGenerator<DynamoDBItem[]> {
  let pageInput = input;

  while (true) {
    const result = await send(pageInput);
    yield (result.Items ?? []) as DynamoDBItem[];

    if (!result.LastEvaluatedKey) {
      return;
    }
    pageInput = { ...input, ExclusiveStartKey: result.LastEvaluatedKey };
  }
}

/**
 * Query をページ単位で取得する。
 *
 * `for await` の途中で `break` すると以降のページは取得しないため、件数上限での打ち切りに使える。
 * 例外は包まずそのまま伝播する。呼び出し元ごとに包み方 (toDatabaseError / 独自メッセージ) が異なり、
 * ここで包むと独自メッセージの箇所で文言が二重になるため。
 */
export async function* queryPages(
  docClient: DynamoDBDocumentClient,
  input: QueryCommandInput
): AsyncGenerator<DynamoDBItem[]> {
  yield* paginate(input, (pageInput) => docClient.send(new QueryCommand(pageInput)));
}

/**
 * Query の全ページを連結して返す。例外の扱いは queryPages と同じ。
 */
export async function queryAllItems(
  docClient: DynamoDBDocumentClient,
  input: QueryCommandInput
): Promise<DynamoDBItem[]> {
  const items: DynamoDBItem[] = [];
  for await (const page of queryPages(docClient, input)) {
    items.push(...page);
  }
  return items;
}

/**
 * Scan の全ページを連結して返す。例外は包まずそのまま伝播する (理由は queryPages と同じ)。
 */
export async function scanAllItems(
  docClient: DynamoDBDocumentClient,
  input: ScanCommandInput
): Promise<DynamoDBItem[]> {
  const items: DynamoDBItem[] = [];
  for await (const page of paginate(input, (pageInput) =>
    docClient.send(new ScanCommand(pageInput))
  )) {
    items.push(...page);
  }
  return items;
}
