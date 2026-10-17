/**
 * ErrorEventMapper の単体テスト
 */

import type { ErrorEvent } from '@nagiyu/common';
import { InvalidEntityDataError } from '../../../src/dynamodb/errors.js';
import {
  buildErrorEventPK,
  buildErrorEventSK,
  ERROR_EVENT_ENTITY_TYPE,
  ERROR_EVENT_GSI1_PK,
  ERROR_EVENT_PK_PREFIX,
  ERROR_EVENT_SK_PREFIX,
  ERROR_EVENT_TTL_DAYS,
  ErrorEventMapper,
} from '../../../src/error-events/mapper.js';

const OCCURRED_AT_ISO = '2026-05-06T01:32:11.000Z';
const OCCURRED_AT = Date.parse(OCCURRED_AT_ISO);

const baseEvent: ErrorEvent = {
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'stock-tracker-web-error-rate-prod (ALARM)',
  message: 'Threshold Crossed',
  context: '{"raw":true}',
  occurredAt: OCCURRED_AT,
};

/** 旧形式で保存されたアイテム (小文字始まりの属性・ISO 文字列の occurredAt・ttl) */
const legacyItem = {
  PK: 'ERROR_EVENT#stock-tracker',
  SK: `OCCURRED#${OCCURRED_AT_ISO}#evt-1`,
  Type: 'ErrorEvent',
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: baseEvent.title,
  message: baseEvent.message,
  context: baseEvent.context,
  occurredAt: OCCURRED_AT_ISO,
  ttl: 1790000000,
  CreatedAt: 1,
  UpdatedAt: 1,
};

describe('キーの組み立て', () => {
  it('PK はプレフィックス付きのサービス ID', () => {
    expect(buildErrorEventPK('stock-tracker')).toBe(`${ERROR_EVENT_PK_PREFIX}stock-tracker`);
  });

  it('SK は ISO 文字列に直した発生時刻と eventId を結合する', () => {
    expect(buildErrorEventSK(OCCURRED_AT, 'evt-1')).toBe(
      `${ERROR_EVENT_SK_PREFIX}${OCCURRED_AT_ISO}#evt-1`
    );
  });

  it('ミリ秒が 0 でも固定長 (.000Z) の ISO 文字列になる', () => {
    expect(buildErrorEventSK(Date.parse('2026-05-06T01:32:11Z'), 'e')).toBe(
      'OCCURRED#2026-05-06T01:32:11.000Z#e'
    );
  });

  it('SK から ISO 文字列を取り出して往復しても元のミリ秒に戻る', () => {
    const sk = buildErrorEventSK(OCCURRED_AT, 'evt-1');
    const iso = sk.slice(ERROR_EVENT_SK_PREFIX.length, sk.lastIndexOf('#'));
    expect(Date.parse(iso)).toBe(OCCURRED_AT);
  });

  it('日時として解釈できない発生時刻は InvalidEntityDataError', () => {
    expect(() => buildErrorEventSK(Number.NaN, 'evt-1')).toThrow(InvalidEntityDataError);
    expect(() => buildErrorEventSK('x' as unknown as number, 'evt-1')).toThrow(
      InvalidEntityDataError
    );
  });
});

describe('ErrorEventMapper', () => {
  const mapper = new ErrorEventMapper(() => 1234567890);

  describe('buildKeys / getKey', () => {
    it('getKey の結果から buildKeys で PK / SK を作れる', () => {
      expect(mapper.buildKeys(mapper.getKey(baseEvent))).toEqual({
        PK: 'ERROR_EVENT#stock-tracker',
        SK: `OCCURRED#${OCCURRED_AT_ISO}#evt-1`,
      });
    });
  });

  describe('toItem', () => {
    it('PascalCase の属性・Type・GSI・TTL (秒)・時刻 (ミリ秒) を持つ Item を返す', () => {
      const sortKey = `OCCURRED#${OCCURRED_AT_ISO}#evt-1`;

      expect(mapper.toItem(baseEvent)).toEqual({
        PK: 'ERROR_EVENT#stock-tracker',
        SK: sortKey,
        Type: ERROR_EVENT_ENTITY_TYPE,
        GSI1PK: ERROR_EVENT_GSI1_PK,
        GSI1SK: sortKey,
        EventID: 'evt-1',
        ServiceID: 'stock-tracker',
        Source: 'cloudwatch-alarm',
        Severity: 'error',
        Title: baseEvent.title,
        Message: baseEvent.message,
        Context: baseEvent.context,
        OccurredAt: OCCURRED_AT,
        TTL: Math.floor(OCCURRED_AT / 1000) + ERROR_EVENT_TTL_DAYS * 24 * 60 * 60,
        CreatedAt: 1234567890,
        UpdatedAt: 1234567890,
      });
    });

    it('旧名の ttl や小文字始まりの属性は書かない', () => {
      const item = mapper.toItem(baseEvent);
      for (const legacy of ['ttl', 'eventId', 'serviceId', 'occurredAt']) {
        expect(item).not.toHaveProperty(legacy);
      }
    });

    it('TTL は端数のミリ秒を切り捨てた秒になる', () => {
      const item = mapper.toItem({ ...baseEvent, occurredAt: OCCURRED_AT + 999 });
      expect(item.TTL).toBe(Math.floor(OCCURRED_AT / 1000) + ERROR_EVENT_TTL_DAYS * 24 * 60 * 60);
    });

    it('CreatedAt の既定は現在時刻', () => {
      const before = Date.now();
      const item = new ErrorEventMapper().toItem(baseEvent);
      expect(item.CreatedAt as number).toBeGreaterThanOrEqual(before);
    });
  });

  describe('toEntity', () => {
    it('toItem の結果を ErrorEvent に復元する', () => {
      expect(mapper.toEntity(mapper.toItem(baseEvent))).toEqual(baseEvent);
    });

    it('旧形式のアイテム (小文字属性・ISO 文字列の occurredAt) を読める', () => {
      expect(mapper.toEntity(legacyItem)).toEqual(baseEvent);
    });

    it('新旧が併存するときは新名を優先する', () => {
      const entity = mapper.toEntity({
        ...legacyItem,
        EventID: 'new-id',
        Title: '新しいタイトル',
        OccurredAt: OCCURRED_AT + 1000,
      });
      expect(entity.eventId).toBe('new-id');
      expect(entity.title).toBe('新しいタイトル');
      expect(entity.occurredAt).toBe(OCCURRED_AT + 1000);
      expect(entity.serviceId).toBe('stock-tracker');
    });

    it('キー属性など余分な属性は含めない', () => {
      const result = mapper.toEntity({ ...mapper.toItem(baseEvent), extra: 1 });
      expect(Object.keys(result).sort()).toEqual(Object.keys(baseEvent).sort());
    });

    it('message / context が空文字でも受け付ける', () => {
      const event = { ...baseEvent, message: '', context: '' };
      expect(mapper.toEntity(mapper.toItem(event))).toEqual(event);
    });

    it.each([
      ['EventID', 'eventId'],
      ['ServiceID', 'serviceId'],
      ['Title', 'title'],
      ['Message', 'message'],
      ['Context', 'context'],
      ['OccurredAt', 'occurredAt'],
    ])('%s が新旧どちらにも無いと、そのフィールド名を含む例外を投げる', (current, legacy) => {
      const item: Record<string, unknown> = { ...mapper.toItem(baseEvent), [legacy]: 'x' };
      delete item[current];
      delete item[legacy];
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      expect(() => mapper.toEntity(item)).toThrow(current);
    });

    it('文字列でないフィールドは例外を投げる', () => {
      expect(() => mapper.toEntity({ ...mapper.toItem(baseEvent), Title: 123 })).toThrow('Title');
    });

    it('未知の Severity は例外を投げる', () => {
      expect(() => mapper.toEntity({ ...mapper.toItem(baseEvent), Severity: 'fatal' })).toThrow(
        'Severity'
      );
    });

    it('未知の Source は例外を投げる', () => {
      expect(() => mapper.toEntity({ ...mapper.toItem(baseEvent), Source: 'unknown' })).toThrow(
        'Source'
      );
    });

    it('解釈できない OccurredAt は例外を投げる', () => {
      expect(() => mapper.toEntity({ ...mapper.toItem(baseEvent), OccurredAt: 'bad' })).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toUpdateAttributes', () => {
    it('変更が空なら何も返さない', () => {
      const attributes = mapper.toUpdateAttributes({});
      expect(Object.values(attributes).every((value) => value === undefined)).toBe(true);
    });

    it.each(Object.keys(baseEvent))('%s を含む patch は拒否する', (field) => {
      expect(() =>
        mapper.toUpdateAttributes({ [field]: baseEvent[field as keyof ErrorEvent] })
      ).toThrow(InvalidEntityDataError);
    });
  });

  describe('legacyAttributeNames', () => {
    it('新名ごとに旧名を宣言する', () => {
      expect(mapper.legacyAttributeNames).toEqual({
        EventID: ['eventId'],
        ServiceID: ['serviceId'],
        Source: ['source'],
        Severity: ['severity'],
        Title: ['title'],
        Message: ['message'],
        Context: ['context'],
        OccurredAt: ['occurredAt'],
        TTL: ['ttl'],
      });
    });
  });
});
