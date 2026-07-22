import { createChunkRepos } from '../../../src/migration/chunk-repos.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';
import type { WebRawEntity } from '../../../src/entities/webraw.entity.js';

const USER_ID = 'u1';
const CHARACTER_ID = 'hiyori';

function makeMessage(overrides: Partial<MessageEntity> = {}): MessageEntity {
  return {
    UserID: USER_ID,
    CharacterID: CHARACTER_ID,
    MessageID: 'M1',
    Role: 'user',
    Text: 'テスト',
    CreatedAt: 1000,
    UpdatedAt: 1000,
    ...overrides,
  };
}

function makeWebRaw(overrides: Partial<WebRawEntity> = {}): WebRawEntity {
  return {
    UserID: USER_ID,
    CharacterID: CHARACTER_ID,
    RawID: 'W1',
    Query: 'クエリ',
    RawText: 'テキスト',
    SourceUrls: [],
    Origin: 'auto',
    CreatedAt: 1000,
    ...overrides,
  };
}

describe('createChunkRepos', () => {
  it('注入した擬似メッセージ・擬似 webraw が listSince(0) で取得できる', async () => {
    const messages = [makeMessage()];
    const webRaws = [makeWebRaw()];

    const { messageRepo, webRawRepo, cursorRepo } = createChunkRepos(messages, webRaws);

    const listedMessages = await messageRepo.listSince(USER_ID, CHARACTER_ID, 0);
    const listedWebRaws = await webRawRepo.listSince(USER_ID, CHARACTER_ID, 0);

    expect(listedMessages).toHaveLength(1);
    expect(listedMessages[0].Text).toBe('テスト');
    expect(listedWebRaws).toHaveLength(1);
    expect(listedWebRaws[0].RawText).toBe('テキスト');

    // カーソルは常に空（0 起点）
    expect(await cursorRepo.get(USER_ID, CHARACTER_ID)).toBeNull();
  });

  it('空配列を渡すと空のリポジトリが返る', async () => {
    const { messageRepo, webRawRepo } = createChunkRepos([], []);
    expect(await messageRepo.listSince(USER_ID, CHARACTER_ID, 0)).toHaveLength(0);
    expect(await webRawRepo.listSince(USER_ID, CHARACTER_ID, 0)).toHaveLength(0);
  });
});
