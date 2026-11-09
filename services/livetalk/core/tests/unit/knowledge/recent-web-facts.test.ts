import { selectRecentWebFacts } from '../../../src/knowledge/recent-web-facts.js';

const fact = (factId: string, observedAt: number) => ({ factId, observedAt });

describe('selectRecentWebFacts', () => {
  it('観測日時の降順で先頭 N 件を返す', () => {
    const facts = [fact('A', 100), fact('B', 300), fact('C', 200), fact('D', 50)];

    expect(selectRecentWebFacts(facts, 2).map((f) => f.factId)).toEqual(['B', 'C']);
  });

  it('観測日時が同じなら factId の降順（新しい ULID）を先にする', () => {
    const facts = [fact('01A', 100), fact('01C', 100), fact('01B', 100)];

    expect(selectRecentWebFacts(facts, 3).map((f) => f.factId)).toEqual(['01C', '01B', '01A']);
  });

  it('入力の並びに依らず結果が同じになる', () => {
    const facts = [fact('01A', 100), fact('01B', 100), fact('01C', 200)];

    expect(selectRecentWebFacts([...facts].reverse(), 2)).toEqual(selectRecentWebFacts(facts, 2));
  });

  it('N 件以下ならすべてを新しい順で返す', () => {
    const facts = [fact('A', 1), fact('B', 2)];

    expect(selectRecentWebFacts(facts, 5).map((f) => f.factId)).toEqual(['B', 'A']);
  });

  it('入力配列を変更しない', () => {
    const facts = [fact('A', 1), fact('B', 2)];

    selectRecentWebFacts(facts, 1);

    expect(facts.map((f) => f.factId)).toEqual(['A', 'B']);
  });

  it('空配列なら空配列を返す', () => {
    expect(selectRecentWebFacts([], 5)).toEqual([]);
  });

  it('limit が 0 以下なら空配列を返す', () => {
    expect(selectRecentWebFacts([fact('A', 1)], 0)).toEqual([]);
    expect(selectRecentWebFacts([fact('A', 1)], -1)).toEqual([]);
  });
});
