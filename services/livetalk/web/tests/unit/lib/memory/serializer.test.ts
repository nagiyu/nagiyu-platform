import type { SelfFactEntity } from '@nagiyu/livetalk-core';
import { sortSelfFacts, toSelfFactListItem } from '@/lib/memory/serializer';
import { decodeSelfFactId } from '@/lib/memory/memory-id';
import type { SelfFactListItem } from '@/lib/memory/types';

const entity: SelfFactEntity = {
  UserID: 'user-1',
  CharacterID: 'hiyori',
  TopicID: 'topic-1',
  FactID: 'fact-1',
  Text: 'コーヒーが好き',
  Provenance: '',
  CreatedAt: 500,
};

describe('toSelfFactListItem', () => {
  it('camelCase DTO に変換し、id は decode 可能', () => {
    const dto = toSelfFactListItem(entity, '好きな飲み物');
    expect(dto).toMatchObject({
      topicId: 'topic-1',
      subject: '好きな飲み物',
      text: 'コーヒーが好き',
      createdAt: 500,
    });
    const key = decodeSelfFactId(dto.id, 'user-1');
    expect(key).toEqual({
      userId: 'user-1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      factId: 'fact-1',
    });
  });
});

describe('sortSelfFacts', () => {
  const make = (id: string, created: number): SelfFactListItem => ({
    id,
    topicId: 't',
    subject: 's',
    text: id,
    createdAt: created,
  });

  it('作成日時の新しい順（降順）に並べる', () => {
    const sorted = sortSelfFacts([make('old', 1), make('new', 100), make('mid', 50)]);
    expect(sorted.map((m) => m.id)).toEqual(['new', 'mid', 'old']);
  });

  it('元配列を変更しない', () => {
    const input = [make('a', 1), make('b', 2)];
    sortSelfFacts(input);
    expect(input.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
