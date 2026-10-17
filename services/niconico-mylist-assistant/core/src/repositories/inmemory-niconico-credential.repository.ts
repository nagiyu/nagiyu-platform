/**
 * NiconicoMylistAssistant Core - InMemory NiconicoCredential Repository
 *
 * テスト用のインメモリ実装
 */

import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { NiconicoCredentialRepository } from './niconico-credential.repository.interface.js';
import type {
  NiconicoCredentialEntity,
  NiconicoCredentialKey,
  CreateNiconicoCredentialInput,
} from '../entities/niconico-credential.entity.js';
import { NiconicoCredentialMapper } from '../mappers/niconico-credential.mapper.js';

/**
 * InMemory NiconicoCredential Repository
 *
 * ニコニコ資格情報の CRUD をすべて EntityStore に任せる。
 * テスト環境で使用
 */
export class InMemoryNiconicoCredentialRepository implements NiconicoCredentialRepository {
  private readonly entityStore: EntityStore<NiconicoCredentialEntity, NiconicoCredentialKey>;

  constructor(store: InMemorySingleTableStore) {
    this.entityStore = new InMemoryEntityStore(store, new NiconicoCredentialMapper());
  }

  /**
   * ユーザーID でニコニコ資格情報を取得
   */
  public async getByUserId(userId: string): Promise<NiconicoCredentialEntity | null> {
    return this.entityStore.get({ userId });
  }

  /**
   * ニコニコ資格情報を保存（upsert）
   */
  public async upsert(input: CreateNiconicoCredentialInput): Promise<NiconicoCredentialEntity> {
    return this.entityStore.put(input);
  }

  /**
   * ニコニコ資格情報を削除
   */
  public async delete(userId: string): Promise<void> {
    await this.entityStore.delete({ userId });
  }

  /**
   * ニコニコ資格情報を削除する。対象がなくても成功する
   */
  public async deleteIfExists(userId: string): Promise<void> {
    await this.entityStore.deleteIfExists({ userId });
  }
}
