/**
 * ErrorEvent の値一覧と型ガードの単体テスト
 */

import {
  ERROR_SEVERITIES,
  ERROR_SOURCES,
  isErrorSeverity,
  isErrorSource,
} from '../../../src/error-event/index.js';

describe('ERROR_SEVERITIES / ERROR_SOURCES', () => {
  it('重大度の一覧を持つ', () => {
    expect(ERROR_SEVERITIES).toEqual(['info', 'warning', 'error', 'critical']);
  });

  it('発生源種別の一覧を持つ', () => {
    expect(ERROR_SOURCES).toEqual(['cloudwatch-alarm', 'application', 'manual', 'batch-event']);
  });
});

describe('isErrorSeverity', () => {
  it.each(ERROR_SEVERITIES)('%s は true', (value) => {
    expect(isErrorSeverity(value)).toBe(true);
  });

  it.each([['unknown'], [''], ['ERROR'], [undefined], [null], [1], [{}]])(
    '%p は false',
    (value) => {
      expect(isErrorSeverity(value)).toBe(false);
    }
  );
});

describe('isErrorSource', () => {
  it.each(ERROR_SOURCES)('%s は true', (value) => {
    expect(isErrorSource(value)).toBe(true);
  });

  it.each([['unknown'], [''], ['Manual'], [undefined], [null], [1], [{}]])(
    '%p は false',
    (value) => {
      expect(isErrorSource(value)).toBe(false);
    }
  );
});
