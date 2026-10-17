/**
 * Stock Tracker Core - ProjectionExpression 組み立て Unit Tests
 */

import { buildProjection } from '../../../src/repositories/projection.js';

describe('buildProjection', () => {
  it('属性のパスを、プレースホルダを使った式とその対応表に変換する', () => {
    expect(buildProjection([['TickerID'], ['Date']])).toEqual({
      ProjectionExpression: '#proj0, #proj1',
      ExpressionAttributeNames: { '#proj0': 'TickerID', '#proj1': 'Date' },
    });
  });

  it('ネストしたパスはキーごとにプレースホルダにして `.` でつなぐ', () => {
    expect(buildProjection([['Probabilities', 'DIR', 'probability']])).toEqual({
      ProjectionExpression: '#proj0.#proj1.#proj2',
      ExpressionAttributeNames: {
        '#proj0': 'Probabilities',
        '#proj1': 'DIR',
        '#proj2': 'probability',
      },
    });
  });

  it('複数のパスで同じ名前が現れても、プレースホルダを使い回して名前を重複させない', () => {
    const { ProjectionExpression, ExpressionAttributeNames } = buildProjection([
      ['Probabilities', 'DIR', 'probability'],
      ['Probabilities', 'DIR', 'baseline'],
      ['Probabilities', 'VOL', 'probability'],
    ]);

    expect(ProjectionExpression).toBe(
      '#proj0.#proj1.#proj2, #proj0.#proj1.#proj3, #proj0.#proj4.#proj2'
    );
    expect(Object.values(ExpressionAttributeNames).sort()).toEqual(
      ['DIR', 'Probabilities', 'VOL', 'baseline', 'probability'].sort()
    );
  });

  it('パスが空のときは空の式を返す', () => {
    expect(buildProjection([])).toEqual({ ProjectionExpression: '', ExpressionAttributeNames: {} });
  });
});
