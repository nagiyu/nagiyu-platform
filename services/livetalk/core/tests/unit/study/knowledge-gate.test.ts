import {
  searchKnowledge,
  classifyTopic,
  evaluateKnowledgeGate,
} from '../../../src/study/knowledge-gate.js';
import type { KnowledgeEntity } from '../../../src/entities/knowledge.entity.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';

// ── ヘルパー ──────────────────────────────────────────────────────────────

function makeKnowledge(overrides: Partial<KnowledgeEntity> = {}): KnowledgeEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    KnowledgeID: 'k1',
    Topic: 'モンスターハンター',
    Summary: 'カプコンのアクションRPGシリーズ。最新作はワイルズ。',
    SourceUrls: [],
    RawComment: '面白そう！',
    RelatedCategory: 'ゲーム',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeLLMClient(result: { needsStudy: boolean; normalizedTopic: string }): ILLMClient {
  return {
    chatStream: jest.fn(async function* () { yield ''; }),
    chatComplete: jest.fn(),
    chatStructured: jest.fn(async () => result) as unknown as ILLMClient['chatStructured'],
    summarize: jest.fn(async () => ({ mergedSummary: '', newMemoryCandidates: [] })),
  };
}

// ── searchKnowledge ───────────────────────────────────────────────────────

describe('searchKnowledge', () => {
  it('空の knowledge 配列は空を返す', () => {
    expect(searchKnowledge('モンハン', [])).toEqual([]);
  });

  it('Topic に一致するトークンがある場合はヒット', () => {
    const k = makeKnowledge({ Topic: 'モンスターハンターワイルズ', Summary: '新作アクションRPG' });
    const hits = searchKnowledge('モンスターハンター', [k]);
    expect(hits).toHaveLength(1);
  });

  it('Summary に一致するトークンがある場合はヒット', () => {
    const k = makeKnowledge({ Topic: 'ゲーム情報', Summary: 'モンスターハンターの最新情報' });
    const hits = searchKnowledge('モンスターハンター', [k]);
    expect(hits).toHaveLength(1);
  });

  it('一致しないトークンはヒットしない', () => {
    const k = makeKnowledge({ Topic: 'コーヒー豆', Summary: 'エチオピア産の豆が人気' });
    expect(searchKnowledge('モンスターハンター', [k])).toHaveLength(0);
  });

  it('1文字以下のトークンは除外される（ノイズ防止）', () => {
    const k = makeKnowledge({ Topic: 'を情報', Summary: 'の内容' });
    // "を" "の" は1文字なのでトークンにならない
    expect(searchKnowledge('を の', [k])).toHaveLength(0);
  });

  it('複数 knowledge から複数ヒット', () => {
    const k1 = makeKnowledge({ KnowledgeID: 'k1', Topic: 'モンハン', Summary: 'ゲーム' });
    const k2 = makeKnowledge({ KnowledgeID: 'k2', Topic: 'コーヒー', Summary: '飲み物' });
    const k3 = makeKnowledge({ KnowledgeID: 'k3', Topic: 'モンスターハンター最新', Summary: 'ゲーム情報' });
    const hits = searchKnowledge('モンハン', [k1, k2, k3]);
    expect(hits).toHaveLength(1);
    expect(hits[0].KnowledgeID).toBe('k1');
  });

  it('大文字小文字の違いを無視してマッチ', () => {
    const k = makeKnowledge({ Topic: 'JavaScript', Summary: 'プログラミング言語' });
    const hits = searchKnowledge('javascript', [k]);
    expect(hits).toHaveLength(1);
  });

  it('userText が空の場合は空を返す', () => {
    const k = makeKnowledge();
    expect(searchKnowledge('', [k])).toHaveLength(0);
  });
});

// ── classifyTopic ─────────────────────────────────────────────────────────

describe('classifyTopic', () => {
  it('needsStudy=true を返す場合（時事・ニッチ）', async () => {
    const llm = makeLLMClient({ needsStudy: true, normalizedTopic: '最新ニュース' });
    const result = await classifyTopic('最新ニュース教えて', 'ひより', llm);
    expect(result.needsStudy).toBe(true);
    expect(result.normalizedTopic).toBe('最新ニュース');
  });

  it('needsStudy=false を返す場合（一般常識）', async () => {
    const llm = makeLLMClient({ needsStudy: false, normalizedTopic: '日本の首都' });
    const result = await classifyTopic('日本の首都ってどこ？', 'ひより', llm);
    expect(result.needsStudy).toBe(false);
  });

  it('chatStructured を purpose=classify で呼び出す', async () => {
    const llm = makeLLMClient({ needsStudy: false, normalizedTopic: '挨拶' });
    await classifyTopic('おはよう', 'ひより', llm);
    expect(llm.chatStructured).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'おはよう' })]),
      expect.anything(),
      expect.objectContaining({ purpose: 'classify' })
    );
  });
});

// ── evaluateKnowledgeGate ─────────────────────────────────────────────────

describe('evaluateKnowledgeGate', () => {
  it('知識ベースにヒットすれば knowledge_hit を返す', async () => {
    const k = makeKnowledge({ Topic: 'モンスターハンター', Summary: 'カプコンのゲーム' });
    const llm = makeLLMClient({ needsStudy: true, normalizedTopic: 'モンハン' });
    const result = await evaluateKnowledgeGate('モンスターハンター', 'ひより', [k], llm);
    expect(result.kind).toBe('knowledge_hit');
    // LLM は呼ばれない（ヒット時は即返却）
    expect(llm.chatStructured).not.toHaveBeenCalled();
  });

  it('knowledge_hit 時に一致した knowledge を含む', async () => {
    const k = makeKnowledge({ KnowledgeID: 'k1', Topic: 'モンスターハンター' });
    const llm = makeLLMClient({ needsStudy: false, normalizedTopic: 'x' });
    const result = await evaluateKnowledgeGate('モンスターハンター', 'ひより', [k], llm);
    if (result.kind !== 'knowledge_hit') throw new Error('unexpected');
    expect(result.knowledge[0].KnowledgeID).toBe('k1');
  });

  it('ヒットなし + needsStudy=true → study を返す', async () => {
    const llm = makeLLMClient({ needsStudy: true, normalizedTopic: '最新アニメ' });
    const result = await evaluateKnowledgeGate('最新アニメ教えて', 'ひより', [], llm);
    expect(result.kind).toBe('study');
    if (result.kind !== 'study') throw new Error('unexpected');
    expect(result.normalizedTopic).toBe('最新アニメ');
  });

  it('ヒットなし + needsStudy=false → normal を返す', async () => {
    const llm = makeLLMClient({ needsStudy: false, normalizedTopic: '挨拶' });
    const result = await evaluateKnowledgeGate('おはよう！', 'ひより', [], llm);
    expect(result.kind).toBe('normal');
  });

  it('知識ベースが空 + needsStudy=true → study を返す', async () => {
    const llm = makeLLMClient({ needsStudy: true, normalizedTopic: 'ユーザー固有の話題' });
    const result = await evaluateKnowledgeGate('私の実家の近くのラーメン屋', 'ひより', [], llm);
    expect(result.kind).toBe('study');
  });

  it('知識ベースにヒットする場合は LLM 分類を呼ばない（コード側で gating）', async () => {
    const k = makeKnowledge({ Topic: 'モンスターハンター' });
    const llm = makeLLMClient({ needsStudy: true, normalizedTopic: 'x' });
    await evaluateKnowledgeGate('モンスターハンター', 'ひより', [k], llm);
    expect(llm.chatStructured).not.toHaveBeenCalled();
  });

  it('複数 knowledge があり一致するものだけ返す', async () => {
    const k1 = makeKnowledge({ KnowledgeID: 'k1', Topic: 'モンハン', Summary: 'ゲーム' });
    const k2 = makeKnowledge({ KnowledgeID: 'k2', Topic: 'コーヒー豆', Summary: '飲み物の話' });
    const llm = makeLLMClient({ needsStudy: false, normalizedTopic: 'x' });
    const result = await evaluateKnowledgeGate('コーヒー', 'ひより', [k1, k2], llm);
    expect(result.kind).toBe('knowledge_hit');
    if (result.kind !== 'knowledge_hit') throw new Error('unexpected');
    expect(result.knowledge.map((k) => k.KnowledgeID)).toEqual(['k2']);
  });
});
