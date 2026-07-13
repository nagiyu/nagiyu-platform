import type { NoteEntity, TopicBundle } from '@nagiyu/livetalk-core';
import { sortNotes, toNoteDetail, toNoteListItem } from '@/lib/notes/serializer';
import { decodeNoteId } from '@/lib/notes/note-id';

const baseEntity: NoteEntity = {
  UserID: 'user-1',
  CharacterID: 'hiyori',
  NoteID: 'note-001',
  TopicID: 'topic-001',
  Subject: 'コーヒーの効能',
  Headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
  CreatedAt: 1_750_000_000_000,
  UpdatedAt: 1_750_000_000_000,
};

const makeBundle = (overrides: Partial<TopicBundle> = {}): TopicBundle => ({
  topic: null,
  selfFacts: [],
  webFacts: [
    {
      UserID: 'user-1',
      CharacterID: 'hiyori',
      TopicID: 'topic-001',
      FactID: 'fact-1',
      Text: 'コーヒーには覚醒作用がある',
      SourceUrls: ['https://example.com/a'],
      Volatility: 'stable',
      ObservedAt: 1_750_000_000_000,
      CreatedAt: 1_750_000_000_000,
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
    expect(item.headline).toBe(baseEntity.Headline);
    expect(item.webFacts).toEqual(['コーヒーには覚醒作用がある']);
    expect(item.sources).toEqual(['https://example.com/a']);
  });

  it('複数 WEB fact の出典 URL を dedup する', () => {
    const bundle = makeBundle({
      webFacts: [
        {
          UserID: 'user-1',
          CharacterID: 'hiyori',
          TopicID: 'topic-001',
          FactID: 'fact-1',
          Text: 'fact1',
          SourceUrls: ['https://example.com/a', 'https://example.com/b'],
          Volatility: 'stable',
          ObservedAt: 1,
          CreatedAt: 1,
        },
        {
          UserID: 'user-1',
          CharacterID: 'hiyori',
          TopicID: 'topic-001',
          FactID: 'fact-2',
          Text: 'fact2',
          SourceUrls: ['https://example.com/a'],
          Volatility: 'stable',
          ObservedAt: 1,
          CreatedAt: 1,
        },
      ],
    });
    const item = toNoteDetail(baseEntity, bundle);
    expect(item.webFacts).toEqual(['fact1', 'fact2']);
    expect(item.sources).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('出典 URL は http(s) スキームのみ許可し javascript: 等を弾く', () => {
    const bundle = makeBundle({
      webFacts: [
        {
          UserID: 'user-1',
          CharacterID: 'hiyori',
          TopicID: 'topic-001',
          FactID: 'fact-1',
          Text: 'fact1',
          // eslint-disable-next-line no-script-url
          SourceUrls: ['https://example.com/a', 'javascript:alert(1)', 'http://example.org/b'],
          Volatility: 'stable',
          ObservedAt: 1,
          CreatedAt: 1,
        },
      ],
    });
    const item = toNoteDetail(baseEntity, bundle);
    expect(item.sources).toEqual(['https://example.com/a', 'http://example.org/b']);
  });

  it('bundle が null（Topic 取得失敗等）でも headline のみ返す（fail-soft）', () => {
    const item = toNoteDetail(baseEntity, null);
    expect(item.headline).toBe(baseEntity.Headline);
    expect(item.webFacts).toBeUndefined();
    expect(item.sources).toBeUndefined();
  });

  it('bundle の webFacts が空でも headline は返す', () => {
    const item = toNoteDetail(baseEntity, makeBundle({ webFacts: [] }));
    expect(item.headline).toBe(baseEntity.Headline);
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
