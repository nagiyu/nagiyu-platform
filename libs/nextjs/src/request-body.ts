/**
 * Request Body Reader for Next.js API Routes
 *
 * Provides a safe JSON body reader for Next.js API Routes.
 */

/**
 * JSON オブジェクトボディの読み取り結果
 *
 * 読み取りに失敗した理由は区別しない。呼び出し側はどの失敗でも同じ 400 を返すため。
 */
export type JsonObjectBodyResult = { ok: true; body: Record<string, unknown> } | { ok: false };

/**
 * リクエストボディを JSON オブジェクトとして安全に読み取る
 *
 * 壊れた JSON・空ボディ・null・配列・プリミティブは、いずれも利用者の入力の誤りである。
 * 呼び出し側が自前の 400 レスポンスを組み立てるため、例外やレスポンスではなく結果を返す。
 * ボディ読み取り済みなどによる読み取り失敗も同様に利用者起因の失敗として扱う。
 * エラーの通報はここでは行わない (通報は呼び出し側の責務)。
 *
 * 返す body の各項目は unknown のままで、項目の型の検証は呼び出し側で行う。
 *
 * @param request - リクエスト
 * @returns 読み取れた場合は ok: true とボディ、それ以外は ok: false
 *
 * @example
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const result = await readJsonObjectBody(request);
 *   if (!result.ok) {
 *     return NextResponse.json(
 *       { error: 'VALIDATION_ERROR', message: 'リクエストボディが不正です' },
 *       { status: 400 }
 *     );
 *   }
 *   const { name } = result.body;
 * }
 * ```
 */
export async function readJsonObjectBody(request: Request): Promise<JsonObjectBodyResult> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false };
  }

  return { ok: true, body: parsed as Record<string, unknown> };
}
