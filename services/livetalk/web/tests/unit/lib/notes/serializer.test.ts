/**
 * @jest-environment node
 */

import { WEB_FACT_NOTE_LIMIT, type NoteEntity, type TopicBundle } from '@nagiyu/livetalk-core';
import { sortNotes, toNoteDetail, toNoteListItem } from '@/lib/notes/serializer';
import { decodeNoteId } from '@/lib/notes/note-id';

const baseEntity: NoteEntity = {
  userId: 'user-1',
  characterId: 'hiyori',
  noteId: 'note-001',
  topicId: 'topic-001',
  subject: 'コーヒーの効能',
  headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
};

const makeBundle = (overrides: Partial<TopicBundle> = {}): TopicBundle => ({
  topic: null,
  selfFacts: [],
  webFacts: [
    {
      userId: 'user-1',
      characterId: 'hiyori',
      topicId: 'topic-001',
      factId: 'fact-1',
      text: 'コーヒーには覚醒作用がある',
      sourceUrls: ['https://example.com/a'],
      volatility: 'stable',
      observedAt: 1_750_000_000_000,
      createdAt: 1_750_000_000_000,
    },
  ],
  ...overrides,
});

describe('toNoteListItem', () => {
  it('一覧 DTO に変換し headline/webFacts/sources を含めない', () => {
    const item = toNoteListItem(baseEntity);
    expect(item.subject).toBe('コーヒーの効能');
    expect(item.sharedAt).toBe(1_750_000_000_000);
    expect(item.headline).toBeUndefined();
    expect(item.webFacts).toBeUndefined();
    expect(item.sources).toBeUndefined();
    // id は decode で復元できる
    expect(decodeNoteId(item.id, 'user-1')?.noteId).toBe('note-001');
  });
});

describe('toNoteDetail', () => {
  it('bundle ありなら headline / webFacts / sources を含む', () => {
    const item = toNoteDetail(baseEntity, makeBundle());
    expect(item.headline).toBe(baseEntity.headline);
    expect(item.webFacts).toEqual(['コーヒーには覚醒作用がある']);
    expect(item.sources).toEqual(['https://example.com/a']);
  });

  it('複数 WEB fact の出典 URL を dedup する', () => {
    const bundle = makeBundle({
      webFacts: [
        {
          userId: 'user-1',
          characterId: 'hiyori',
          topicId: 'topic-001',
          factId: 'fact-1',
          text: 'fact1',
          sourceUrls: ['https://example.com/a', 'https://example.com/b'],
          volatility: 'stable',
          observedAt: 1,
          createdAt: 1,
        },
        {
          userId: 'user-1',
          characterId: 'hiyori',
          topicId: 'topic-001',
          factId: 'fact-2',
          text: 'fact2',
          sourceUrls: ['https://example.com/a'],
          volatility: 'stable',
          observedAt: 1,
          createdAt: 1,
        },
      ],
    });
    const item = toNoteDetail(baseEntity, bundle);
    expect(item.webFacts).toEqual(['fact2', 'fact1']);
    expect(item.sources).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('出典 URL は http(s) スキームのみ許可し javascript: 等を弾く', () => {
    const bundle = makeBundle({
      webFacts: [
        {
          userId: 'user-1',
          characterId: 'hiyori',
          topicId: 'topic-001',
          factId: 'fact-1',
          text: 'fact1',
          sourceUrls: ['https://example.com/a', 'javascript:alert(1)', 'http://example.org/b'],
          volatility: 'stable',
          observedAt: 1,
          createdAt: 1,
        },
      ],
    });
    const item = toNoteDetail(baseEntity, bundle);
    expect(item.sources).toEqual(['https://example.com/a', 'http://example.org/b']);
  });

  const makeFact = (index: number): TopicBundle['webFacts'][number] => ({
    userId: 'user-1',
    characterId: 'hiyori',
    topicId: 'topic-001',
    factId: `fact-${String(index).padStart(3, '0')}`,
    text: `fact${index}`,
    sourceUrls: [`https://example.com/${index}`],
    volatility: 'stable',
    observedAt: index,
    createdAt: index,
  });

  it('WEB fact は入力が古い順でも観測日時の新しい順に並ぶ', () => {
    const bundle = makeBundle({ webFacts: [makeFact(1), makeFact(2), makeFact(3)] });
    const item = toNoteDetail(baseEntity, bundle);
    expect(item.webFacts).toEqual(['fact3', 'fact2', 'fact1']);
  });

  it('WEB fact が上限を超えると新しい側の上限件数だけになる', () => {
    const total = WEB_FACT_NOTE_LIMIT + 3;
    const facts = Array.from({ length: total }, (_, i) => makeFact(i + 1));
    const item = toNoteDetail(baseEntity, makeBundle({ webFacts: facts }));
    expect(item.webFacts).toHaveLength(WEB_FACT_NOTE_LIMIT);
    expect(item.webFacts?.[0]).toBe(`fact${total}`);
    expect(item.webFacts?.[WEB_FACT_NOTE_LIMIT - 1]).toBe(`fact${total - WEB_FACT_NOTE_LIMIT + 1}`);
  });

  it('出典は絞った後の fact からだけ出る', () => {
    const total = WEB_FACT_NOTE_LIMIT + 2;
    const facts = Array.from({ length: total }, (_, i) => makeFact(i + 1));
    const item = toNoteDetail(baseEntity, makeBundle({ webFacts: facts }));
    expect(item.sources).toHaveLength(WEB_FACT_NOTE_LIMIT);
    expect(item.sources).not.toContain('https://example.com/1');
    expect(item.sources).not.toContain('https://example.com/2');
    expect(item.sources).toContain(`https://example.com/${total}`);
  });

  it('bundle が null（Topic 取得失敗等）でも headline のみ返す（fail-soft）', () => {
    const item = toNoteDetail(baseEntity, null);
    expect(item.headline).toBe(baseEntity.headline);
    expect(item.webFacts).toBeUndefined();
    expect(item.sources).toBeUndefined();
  });

  it('bundle の webFacts が空でも headline は返す', () => {
    const item = toNoteDetail(baseEntity, makeBundle({ webFacts: [] }));
    expect(item.headline).toBe(baseEntity.headline);
    expect(item.webFacts).toEqual([]);
    expect(item.sources).toEqual([]);
  });
});

describe('sortNotes', () => {
  it('sharedAt 降順に並べ替える', () => {
    const a = { ...toNoteListItem(baseEntity), sharedAt: 100 };
    const b = { ...toNoteListItem(baseEntity), sharedAt: 300 };
    const c = { ...toNoteListItem(baseEntity), sharedAt: 200 };
    const sorted = sortNotes([a, b, c]);
    expect(sorted.map((n) => n.sharedAt)).toEqual([300, 200, 100]);
  });
});
