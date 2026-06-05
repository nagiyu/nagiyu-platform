import type { MemoryEntity } from '@nagiyu/livetalk-core';
import { sortMemories, toMemoryListItem } from '@/lib/memory/serializer';
import { decodeMemoryId } from '@/lib/memory/memory-id';
import type { MemoryListItem } from '@/lib/memory/types';

const entity: MemoryEntity = {
  UserID: 'user-1',
  CharacterID: 'hiyori',
  MemoryID: '01HZ',
  Tier: 'B',
  Category: 'food',
  Content: 'コーヒーが好き',
  Confidence: 0.8,
  ReferencedCount: 3,
  LastReferencedAt: 1000,
  CreatedAt: 500,
  UpdatedAt: 600,
};

describe('toMemoryListItem', () => {
  it('camelCase DTO に変換し、id は decode 可能', () => {
    const dto = toMemoryListItem(entity);
    expect(dto).toMatchObject({
      tier: 'B',
      category: 'food',
      content: 'コーヒーが好き',
      confidence: 0.8,
      referencedCount: 3,
      lastReferencedAt: 1000,
      createdAt: 500,
      updatedAt: 600,
    });
    const key = decodeMemoryId(dto.id, 'user-1');
    expect(key).toEqual({
      userId: 'user-1',
      characterId: 'hiyori',
      tier: 'B',
      category: 'food',
      memoryId: '01HZ',
    });
  });

  it('LastReferencedAt が無ければ undefined', () => {
    const dto = toMemoryListItem({ ...entity, LastReferencedAt: undefined });
    expect(dto.lastReferencedAt).toBeUndefined();
  });
});

describe('sortMemories', () => {
  const make = (id: string, lastRef: number | undefined, created: number): MemoryListItem => ({
    id,
    tier: 'B',
    category: 'c',
    content: id,
    confidence: 0.5,
    referencedCount: 0,
    lastReferencedAt: lastRef,
    createdAt: created,
    updatedAt: created,
  });

  it('最終参照の新しい順、未参照は末尾、同点は作成日時降順', () => {
    const sorted = sortMemories([
      make('old-ref', 100, 1),
      make('new-ref', 200, 1),
      make('no-ref-new', undefined, 50),
      make('no-ref-old', undefined, 10),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['new-ref', 'old-ref', 'no-ref-new', 'no-ref-old']);
  });

  it('元配列を変更しない', () => {
    const input = [make('a', 1, 1), make('b', 2, 1)];
    sortMemories(input);
    expect(input.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
