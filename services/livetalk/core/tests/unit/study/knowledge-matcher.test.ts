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
  // 旧テスト: 「最近の飲み物のトレンド知ってる？」× drinkKnowledge（RelatedCategory='飲み物'）で
  // keyphrase recall = 1.0 になるため、minRatio=0.99 でもヒットするようになった。
  // 新指標の意味に合わせ「完全に無関係な語で 0 hits を確認する」ケースに書き換える。
  it('minRatio を上げると弱い一致を除外できる（完全無関係語は 0.99 閾値でも弾かれる）', async () => {
    const strict = new NgramKnowledgeMatcher(0.99);
    // 「天気予報」は drinkKnowledge と共通 2-gram を持たないため keyphrase recall/user recall ともに 0
    const hits = await strict.findMatches('明日の天気予報教えて', [drinkKnowledge]);
    expect(hits).toHaveLength(0);
  });

  // ── フィラー付き自然文の新規受け入れケース（dev 実測を模す）──
  it('「麻辣担の種類について何かわかった？」が RelatedCategory「麻辣担の種類」にヒットする', async () => {
    const k = makeKnowledge({
      KnowledgeID: 'malatang',
      Topic: '麻辣担（マーラー）',
      RelatedCategory: '麻辣担の種類',
      Summary: '麻辣担の種類と特徴についての情報。',
    });
    const hits = await matcher.findMatches('麻辣担の種類について何かわかった？', [k]);
    expect(hits.map((h) => h.KnowledgeID)).toContain('malatang');
  });

  it('「リズム天国の新作について何かわかった？」が RelatedCategory「リズム天国新作」にヒットする', async () => {
    const k = makeKnowledge({
      KnowledgeID: 'rhythm',
      Topic: 'リズム天国 ミラクルスターズ',
      RelatedCategory: 'リズム天国新作',
      Summary: 'リズム天国の新作ゲームに関する情報。',
    });
    const hits = await matcher.findMatches('リズム天国の新作について何かわかった？', [k]);
    expect(hits.map((h) => h.KnowledgeID)).toContain('rhythm');
  });

  // ── keyphrase recall の誤ヒット抑制（ガード条件の確認）──
  it('RelatedCategory が空文字のとき keyphrase 候補から除外され、Topic のみで評価される', async () => {
    // RelatedCategory='' のため keyphrase 候補は Topic のみ
    // Topic「トピック」= 正規化後 4 文字 = 2-gram × 3個 → ガード（>= 3）通過
    const k = makeKnowledge({ Topic: 'トピック', RelatedCategory: '', Summary: 'サマリー内容' });
    // 完全一致する発話 → ヒット
    const hits = await matcher.findMatches('トピック', [k]);
    expect(hits).toHaveLength(1);
  });

  it('Topic が 3 文字以下（2-gram 数 < 3）のとき keyphrase recall は計算されない', async () => {
    // Topic「あいう」= 2-gram × 2個 → ガード除外（短い一般カテゴリ名の暴発対策）
    // user recall のみで評価されるため、無関係な長文ではヒットしない
    const k = makeKnowledge({
      Topic: 'あいう',
      RelatedCategory: '',
      Summary: '全く関係ない説明文',
    });
    // Topic と部分一致する「あい」を含むが、keyphrase 経路は無効・user recall も低いため非ヒット
    const hits = await matcher.findMatches('あいまいな今日の天気の話', [k]);
    expect(hits).toHaveLength(0);
  });

  // ── 短いカテゴリ名 / 弱い部分一致での誤ヒット抑制（fresh-eyes 指摘の回帰）──
  it('短い RelatedCategory「飲み物」と 1 gram だけ一致する近接語「編み物」は誤ヒットしない', async () => {
    // RelatedCategory「飲み物」= 2-gram × 2個 → ガード除外。
    // 「編み物が趣味」は「み物」のみ共有するが keyphrase 経路は無効、user recall も閾値未満。
    const hits = await matcher.findMatches('編み物が趣味なんだ', [drinkKnowledge, sweetsKnowledge]);
    expect(hits).toHaveLength(0);
  });

  it('keyphrase が 3 個以上の 2-gram を持っても、共有 gram が 1 個だけなら弾く（絶対一致数の下限）', async () => {
    // RelatedCategory「あいうえ」= 2-gram × 3個（ガード通過）。発話は「あい」1 個のみ共有。
    // 割合は 1/3 だが、絶対一致数 < 2 のため keyphrase recall は無効化される。
    const k = makeKnowledge({
      KnowledgeID: 'partial',
      Topic: '無関係トピック名',
      RelatedCategory: 'あいうえ',
      Summary: '全く異なる内容の説明',
    });
    const hits = await matcher.findMatches('あいさつは大事だよね', [k]);
    expect(hits).toHaveLength(0);
  });

  it('「ゲーム」のような短い一般カテゴリ名は文脈外の言及で誤ヒットしない', async () => {
    // RelatedCategory「ゲーム」= 2-gram × 2個 → ガード除外。
    const k = makeKnowledge({
      KnowledgeID: 'game',
      Topic: 'ゲームの最新情報',
      RelatedCategory: 'ゲーム',
      Summary: '新作ゲームのトレンド情報。',
    });
    // Topic は keyphrase 対象だが「ゲーム」しか共有せず recall は低い。user recall も閾値未満。
    const hits = await matcher.findMatches('今日はゲームの話じゃなくて天気の話をしたい気分', [k]);
    expect(hits).toHaveLength(0);
  });
});
