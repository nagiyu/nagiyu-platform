/**
 * NiconicoMylistAssistant Core - InMemory NiconicoCredential Repository
 *
 * テスト用のインメモリ実装
 */

import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
import type { NiconicoCredentialRepository } from './niconico-credential.repository.interface.js';
import type {
  NiconicoCredentialEntity,
  CreateNiconicoCredentialInput,
} from '../entities/niconico-credential.entity.js';
import { NiconicoCredentialMapper } from '../mappers/niconico-credential.mapper.js';

/**
 * InMemory NiconicoCredential Repository
 *
 * テスト用のインメモリニコニコ資格情報リポジトリ実装
 */
export class InMemoryNiconicoCredentialRepository implements NiconicoCredentialRepository {
  private readonly mapper: NiconicoCredentialMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new NiconicoCredentialMapper();
  }

  /**
   * ユーザーID でニコニコ資格情報を取得
   */
  public async getByUserId(userId: string): Promise<NiconicoCredentialEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId });
    const item = this.store.get(pk, sk) as DynamoDBItem | undefined;

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * ニコニコ資格情報を保存（upsert）
   */
  public async upsert(input: CreateNiconicoCredentialInput): Promise<NiconicoCredentialEntity> {
    const item = this.mapper.toItem(input);

    // 条件なし保存（upsert）
    this.store.put(item);

    return input;
  }

  /**
   * ニコニコ資格情報を削除
   */
  public async delete(userId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ userId });
    this.store.delete(pk, sk);
  }
}
