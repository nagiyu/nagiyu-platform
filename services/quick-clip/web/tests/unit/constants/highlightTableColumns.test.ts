import {
  HIGHLIGHT_TABLE_COLUMNS,
  type ColumnDefinition,
} from '../../../src/constants/highlightTableColumns';

describe('HIGHLIGHT_TABLE_COLUMNS', () => {
  it('4列が定義されている', () => {
    expect(HIGHLIGHT_TABLE_COLUMNS).toHaveLength(4);
  });

  it('すべての列に id が定義されている', () => {
    HIGHLIGHT_TABLE_COLUMNS.forEach((col: ColumnDefinition) => {
      expect(col.id).toBeTruthy();
    });
  });

  it('すべての列に label が定義されている', () => {
    HIGHLIGHT_TABLE_COLUMNS.forEach((col: ColumnDefinition) => {
      expect(col.label).toBeTruthy();
    });
  });

  it('列の id がすべてユニークである', () => {
    const ids = HIGHLIGHT_TABLE_COLUMNS.map((col) => col.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('固定列は3列（order / time / status）', () => {
    const fixedCols = HIGHLIGHT_TABLE_COLUMNS.filter((col) => col.fixed);
    expect(fixedCols).toHaveLength(3);
    expect(fixedCols.map((c) => c.id)).toEqual(['order', 'time', 'status']);
  });

  it('オプション列は1列（source）', () => {
    const optionalCols = HIGHLIGHT_TABLE_COLUMNS.filter((col) => !col.fixed);
    expect(optionalCols).toHaveLength(1);
    expect(optionalCols[0].id).toBe('source');
  });

  it('固定列はすべてデフォルト表示である', () => {
    const fixedCols = HIGHLIGHT_TABLE_COLUMNS.filter((col) => col.fixed);
    fixedCols.forEach((col) => {
      expect(col.defaultVisible).toBe(true);
    });
  });

  it('source 列はデフォルト非表示である', () => {
    const sourceCol = HIGHLIGHT_TABLE_COLUMNS.find((col) => col.id === 'source');
    expect(sourceCol?.defaultVisible).toBe(false);
  });

  it('order 列のラベルは "No." である', () => {
    const col = HIGHLIGHT_TABLE_COLUMNS.find((c) => c.id === 'order');
    expect(col?.label).toBe('No.');
  });

  it('time 列のラベルは "開始〜終了(秒)" である', () => {
    const col = HIGHLIGHT_TABLE_COLUMNS.find((c) => c.id === 'time');
    expect(col?.label).toBe('開始〜終了(秒)');
  });

  it('status 列のラベルは "採否" である', () => {
    const col = HIGHLIGHT_TABLE_COLUMNS.find((c) => c.id === 'status');
    expect(col?.label).toBe('採否');
  });

  it('source 列のラベルは "抽出根拠" である', () => {
    const col = HIGHLIGHT_TABLE_COLUMNS.find((c) => c.id === 'source');
    expect(col?.label).toBe('抽出根拠');
  });

  it('列の順序は order / time / status / source である', () => {
    const ids = HIGHLIGHT_TABLE_COLUMNS.map((col) => col.id);
    expect(ids).toEqual(['order', 'time', 'status', 'source']);
  });
});
