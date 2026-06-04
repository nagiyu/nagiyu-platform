import { buildMemorySK, type MemoryKey } from '@nagiyu/livetalk-core';
import { decodeMemoryId, encodeMemoryId } from '@/lib/memory/memory-id';

const baseKey: MemoryKey = {
  userId: 'user-1',
  characterId: 'hiyori',
  tier: 'B',
  category: 'food',
  memoryId: '01HZZ0000000000000000000AB',
};

describe('encodeMemoryId / decodeMemoryId', () => {
  it('encode した ID は decode で元のキー（userId は引数優先）に戻る', () => {
    const id = encodeMemoryId(baseKey);
    const decoded = decodeMemoryId(id, baseKey.userId);
    expect(decoded).toEqual(baseKey);
  });

  it('decode は引数の userId を使い、SK には userId を含めない', () => {
    const id = encodeMemoryId(baseKey);
    const decoded = decodeMemoryId(id, 'another-user');
    expect(decoded?.userId).toBe('another-user');
    expect(decoded?.characterId).toBe('hiyori');
  });

  it('encode は base64url（+ / = を含まない）', () => {
    const id = encodeMemoryId({ ...baseKey, category: 'a-b_c' });
    expect(id).not.toMatch(/[+/=]/);
  });

  it('完全 SK 構造を保持する', () => {
    const id = encodeMemoryId(baseKey);
    const sk = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    expect(sk).toBe(buildMemorySK('hiyori', 'B', 'food', baseKey.memoryId));
  });

  it('不正な base64 は null', () => {
    // 復元後に CHAR# で始まらない文字列になる入力
    const id = Buffer.from('not-a-sk', 'utf-8').toString('base64url');
    expect(decodeMemoryId(id, 'user-1')).toBeNull();
  });

  it('SK のパート数が不足していると null', () => {
    const broken = Buffer.from('CHAR#hiyori#MEM#B#food', 'utf-8').toString('base64url');
    expect(decodeMemoryId(broken, 'user-1')).toBeNull();
  });

  it('MEM セグメントが異なると null', () => {
    const broken = Buffer.from('CHAR#hiyori#MSG#B#food#01HZ', 'utf-8').toString('base64url');
    expect(decodeMemoryId(broken, 'user-1')).toBeNull();
  });

  it('不正な Tier は null', () => {
    const broken = Buffer.from('CHAR#hiyori#MEM#Z#food#01HZ', 'utf-8').toString('base64url');
    expect(decodeMemoryId(broken, 'user-1')).toBeNull();
  });

  it('空の category / memoryId は null', () => {
    const broken = Buffer.from('CHAR#hiyori#MEM#A##01HZ', 'utf-8').toString('base64url');
    expect(decodeMemoryId(broken, 'user-1')).toBeNull();
  });
});
