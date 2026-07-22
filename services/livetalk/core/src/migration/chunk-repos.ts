/**
 * 擬似ソース（擬似メッセージ / 擬似 webraw）を in-memory リポジトリへ注入するヘルパー
 * （一回性マイグレーション専用の throwaway コード）。
 *
 * 擬似ソースは永続化しない方針のため、`InMemoryMessageRepository.create()` の
 * ID/タイムスタンプ自動採番は経由せず、生成済みエンティティをそのまま
 * `InMemorySingleTableStore` へ put して注入する。
 */
import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { MessageEntity } from '../entities/message.entity.js';
import type { WebRawEntity } from '../entities/webraw.entity.js';
import { MessageMapper } from '../mappers/message.mapper.js';
import { WebRawMapper } from '../mappers/webraw.mapper.js';
import { InMemoryMessageRepository } from '../repositories/in-memory-message.repository.js';
import { InMemoryWebRawRepository } from '../repositories/in-memory-webraw.repository.js';
import { InMemoryConsolidationCursorRepository } from '../repositories/in-memory-consolidation-cursor.repository.js';

export interface ChunkRepos {
  messageRepo: InMemoryMessageRepository;
  webRawRepo: InMemoryWebRawRepository;
  /** 常に空（0 起点）の in-memory カーソル。実 CURSOR には一切触れない。 */
  cursorRepo: InMemoryConsolidationCursorRepository;
}

/**
 * 1 チャンク分の擬似メッセージ・擬似 webraw を注入した、独立した in-memory リポジトリ群を作る。
 * `consolidate()` の `messageRepo`/`webRawRepo`/`cursorRepo` にそのまま渡せる。
 */
export function createChunkRepos(messages: MessageEntity[], webRaws: WebRawEntity[]): ChunkRepos {
  const store = new InMemorySingleTableStore();
  const messageMapper = new MessageMapper();
  const webRawMapper = new WebRawMapper();

  for (const message of messages) {
    store.put(messageMapper.toItem(message));
  }
  for (const webRaw of webRaws) {
    store.put(webRawMapper.toItem(webRaw));
  }

  return {
    messageRepo: new InMemoryMessageRepository(store),
    webRawRepo: new InMemoryWebRawRepository(store),
    cursorRepo: new InMemoryConsolidationCursorRepository(store),
  };
}
