import {
  InMemoryEntityStore,
  InMemoryUsageCounter,
  type InMemorySingleTableStore,
} from '@nagiyu/aws';
import { DailySaltMapper } from '../mappers/daily-salt.mapper.js';
import { CountingUsageRepository } from './counting-usage.repository.js';

/**
 * InMemory Usage Repository
 *
 * 取得と保存の間に await を挟まないため、同時に呼ばれても上限を超えない。テスト環境で使用
 */
export class InMemoryUsageRepository extends CountingUsageRepository {
  constructor(store: InMemorySingleTableStore) {
    super(new InMemoryUsageCounter(store), new InMemoryEntityStore(store, new DailySaltMapper()));
  }
}
