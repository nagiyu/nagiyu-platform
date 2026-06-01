import {
  NgramKnowledgeMatcher,
  normalizeForMatch,
  toBigrams,
} from '../../../src/study/knowledge-matcher.js';
import type { KnowledgeEntity } from '../../../src/entities/knowledge.entity.js';

function makeKnowledge(overrides: Partial<KnowledgeEntity> = {}): KnowledgeEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    KnowledgeID: 'k1',
    Topic: 'トピック',
    Summary: 'サマリー',
    SourceUrls: [],
    RawComment: '',
    RelatedCategory: '',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

// dev 実データを模した知識（閾値チューニングの根拠ケース）
const drinkKnowledge = makeKnowledge({
  KnowledgeID: 'drink',
  Topic: '飲み物の最新情報（2026年春〜初夏）',
  Summary:
    '飲み物の最新トレンド情報。新商品やブランドのリニューアル、季節限定フレーバーやコラボなど、最近の飲み物の動きをまとめたよ。',
  RelatedCategory: '飲み物',
});
const sweetsKnowledge = makeKnowledge({
  KnowledgeID: 'sweets',
  Topic: '「スイーツ 最新情報」',
  Summary:
    'スイーツの最新情報。百貨店やコンビニ、カフェの新作スイーツや季節限定の商品、コラボなど、最近のスイーツのトレンドを調べたよ。',
  RelatedCategory: 'スイーツ',
});

describe('normalizeForMatch', () => {
  it('小文字化と記号・空白の除去を行う', () => {
    expect(normalizeForMatch('Hello, World！ 「テスト」')).toBe('helloworldテスト');
  });
});

describe('toBigrams', () => {
  it('文字 2-gram 集合を返す', () => {
    expect(toBigrams('あいう')).toEqual(new Set(['あい', 'いう']));
  });

  it('1 文字以下は空集合', () => {
    expect(toBigrams('あ').size).toBe(0);
    expect(toBigrams('').size).toBe(0);
  });
});

describe('NgramKnowledgeMatcher', () => {
  const matcher = new NgramKnowledgeMatcher();

  it('空の knowledge 配列は空を返す', async () => {
    expect(await matcher.findMatches('飲み物', [])).toEqual([]);
  });

  it('userText が空（2-gram なし）なら空を返す', async () => {
    expect(await matcher.findMatches('', [drinkKnowledge])).toEqual([]);
  });

  // ── 問題A の回帰: 自然文でも既知トピックを拾う ──
  it('自然文「最近の飲み物のトレンド知ってる？」が飲み物知識にヒットする', async () => {
    const hits = await matcher.findMatches('最近の飲み物のトレンド知ってる？', [
      drinkKnowledge,
      sweetsKnowledge,
    ]);
    expect(hits.map((k) => k.KnowledgeID)).toContain('drink');
  });

  it('「最近のスイーツ気になる」がスイーツ知識にヒットする', async () => {
    const hits = await matcher.findMatches('最近のスイーツ気になる', [
      drinkKnowledge,
      sweetsKnowledge,
    ]);
    expect(hits.map((k) => k.KnowledgeID)).toContain('sweets');
  });

  // ── 誤ヒット抑制 ──
  it('無関係な単独名詞「モンスターハンター」は飲食知識にヒットしない', async () => {
    const hits = await matcher.findMatches('モンスターハンター', [drinkKnowledge, sweetsKnowledge]);
    expect(hits).toHaveLength(0);
  });

  it('一般常識「日本の首都ってどこ？」は飲食知識にヒットしない', async () => {
    const hits = await matcher.findMatches('日本の首都ってどこ？', [
      drinkKnowledge,
      sweetsKnowledge,
    ]);
    expect(hits).toHaveLength(0);
  });

  it('未知トピック「超かぐや姫って映画知ってる？」はヒットしない', async () => {
    const hits = await matcher.findMatches('超かぐや姫って映画知ってる？', [
      drinkKnowledge,
      sweetsKnowledge,
    ]);
    expect(hits).toHaveLength(0);
  });

  // ── 既存の単独名詞照合（後方互換） ──
  it('Topic に語が含まれればヒット（部分一致相当）', async () => {
    const k = makeKnowledge({ Topic: 'モンスターハンターワイルズ', Summary: '新作' });
    const hits = await matcher.findMatches('モンスターハンター', [k]);
    expect(hits).toHaveLength(1);
  });

  it('大文字小文字を無視してヒット', async () => {
    const k = makeKnowledge({ Topic: 'JavaScript', Summary: 'プログラミング言語' });
    const hits = await matcher.findMatches('javascript', [k]);
    expect(hits).toHaveLength(1);
  });

  // ── 閾値の差し替え ──
  it('minRatio を上げると弱い一致を除外できる', async () => {
    const strict = new NgramKnowledgeMatcher(0.99);
    const hits = await strict.findMatches('最近の飲み物のトレンド知ってる？', [drinkKnowledge]);
    // 0.71 程度の一致は 0.99 閾値では弾かれる
    expect(hits).toHaveLength(0);
  });
});
