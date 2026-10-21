/**
 * リクエストボディが不正なケースの共通定義。
 *
 * 各ルートのテストで、壊れた JSON・null・配列が一律に 400 になることを確認するために共有する。
 * 各要素は [ケース名, request.json() の挙動]。
 */
export type InvalidBodyCase = readonly [string, () => Promise<unknown>];

export const MALFORMED_BODY_CASES: ReadonlyArray<InvalidBodyCase> = [
  [
    '壊れた JSON',
    async () => {
      throw new SyntaxError('Unexpected token');
    },
  ],
  ['本文が null', async () => null],
  ['本文が配列', async () => []],
];

/** json() の挙動からテスト用の Request を作る。 */
export function createRequestWithJson(json: () => Promise<unknown>): Request {
  return { json } as unknown as Request;
}
