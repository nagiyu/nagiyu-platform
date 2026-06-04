/**
 * ベクトル演算ユーティリティ。外部ライブラリ不要の自前実装。
 */

/**
 * 2 つのベクトルの cosine similarity を返す（-1.0 〜 1.0）。
 *
 * - 長さが異なる場合は 0 を返す
 * - どちらかがゼロベクトルの場合は 0 を返す
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}
