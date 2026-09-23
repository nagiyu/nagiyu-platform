import { buildSelfFactSK, type SelfFactKey } from '@nagiyu/livetalk-core';
import { decodeSelfFactId, encodeSelfFactId } from '@/lib/memory/memory-id';

const baseKey: SelfFactKey = {
  userId: 'user-1',
  characterId: 'hiyori',
  topicId: '01HZZ0000000000000000000TP',
  factId: '01HZZ0000000000000000000FA',
};

describe('encodeSelfFactId / decodeSelfFactId', () => {
  it('encode した ID は decode で元のキー（userId は引数優先）に戻る', () => {
    const id = encodeSelfFactId(baseKey);
    const decoded = decodeSelfFactId(id, baseKey.userId);
    expect(decoded).toEqual(baseKey);
  });

  it('decode は引数の userId を使い、SK には userId を含めない', () => {
    const id = encodeSelfFactId(baseKey);
    const decoded = decodeSelfFactId(id, 'another-user');
    expect(decoded?.userId).toBe('another-user');
    expect(decoded?.characterId).toBe('hiyori');
  });

  it('encode は base64url（+ / = を含まない）', () => {
    const id = encodeSelfFactId({ ...baseKey, topicId: 'a-b_c' });
    expect(id).not.toMatch(/[+/=]/);
  });

  it('完全 SK 構造を保持する', () => {
    const id = encodeSelfFactId(baseKey);
    const sk = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    expect(sk).toBe(buildSelfFactSK('hiyori', baseKey.topicId, baseKey.factId));
  });

  it('不正な base64 は null', () => {
    // 復元後に CHAR# で始まらない文字列になる入力
    const id = Buffer.from('not-a-sk', 'utf-8').toString('base64url');
    expect(decodeSelfFactId(id, 'user-1')).toBeNull();
  });

  it('SK のパート数が不足していると null', () => {
    const broken = Buffer.from('CHAR#hiyori#TOPIC#tp1', 'utf-8').toString('base64url');
    expect(decodeSelfFactId(broken, 'user-1')).toBeNull();
  });

  it('TOPIC セグメントが異なると null', () => {
    const broken = Buffer.from('CHAR#hiyori#MEM#tp1#SELF#fa1', 'utf-8').toString('base64url');
    expect(decodeSelfFactId(broken, 'user-1')).toBeNull();
  });

  it('SELF セグメントが異なると null', () => {
    const broken = Buffer.from('CHAR#hiyori#TOPIC#tp1#WEB#fa1', 'utf-8').toString('base64url');
    expect(decodeSelfFactId(broken, 'user-1')).toBeNull();
  });

  it('空の topicId / factId は null', () => {
    const broken = Buffer.from('CHAR#hiyori#TOPIC##SELF#', 'utf-8').toString('base64url');
    expect(decodeSelfFactId(broken, 'user-1')).toBeNull();
  });
});
