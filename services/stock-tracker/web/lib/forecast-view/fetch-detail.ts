import type { ForecastDetailResponse } from '../../types/forecast';

export type ForecastDetailResult =
  | { status: 'ok'; data: ForecastDetailResponse }
  | { status: 'unavailable' }
  | { status: 'error' };

/**
 * 銘柄の確度の詳細を取得する。
 *
 * 404 は「その日の確度がない」という正常系なので、通信失敗・算出失敗とは分けて返す。
 * 例外は投げず、呼び出し側は結果の status だけで表示を切り替える。
 */
export async function fetchForecastDetail(
  tickerId: string,
  date: string,
  fetchFn: typeof fetch = (input) => fetch(input)
): Promise<ForecastDetailResult> {
  try {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const response = await fetchFn(`/api/forecasts/${encodeURIComponent(tickerId)}${query}`);
    if (response.status === 404) {
      return { status: 'unavailable' };
    }
    if (!response.ok) {
      return { status: 'error' };
    }
    return { status: 'ok', data: (await response.json()) as ForecastDetailResponse };
  } catch {
    return { status: 'error' };
  }
}
