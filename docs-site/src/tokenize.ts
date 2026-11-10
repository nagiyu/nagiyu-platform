/**
 * 日本語は空白で単語が区切られないため、検索のインデックスとクエリを同じ規則で分割する。
 * 単語の境界は Intl.Segmenter に任せ、記号や空白だけの断片は捨てる。
 *
 * VitePress は検索オプションの関数を文字列化してブラウザへ送る。そのため外側の変数や
 * 関数を参照せず、この関数の中で完結させる (Segmenter は globalThis に使い回す)。
 */
export function tokenize(text: string): string[] {
  const holder = globalThis as unknown as { __jaSegmenter?: Intl.Segmenter };
  if (!holder.__jaSegmenter) {
    holder.__jaSegmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  }
  const tokens: string[] = [];
  for (const part of holder.__jaSegmenter.segment(text)) {
    if (part.isWordLike) tokens.push(part.segment.toLowerCase());
  }
  return tokens;
}
