import { act, renderHook } from '@testing-library/react';
import { useColumnVisibility } from '../../../src/hooks/useColumnVisibility';
import type { ColumnDefinition } from '../../../src/constants/highlightTableColumns';

const FIXED_COLUMNS: ColumnDefinition[] = [
    { id: 'order', label: 'No.', fixed: true, defaultVisible: true },
    { id: 'time', label: '開始〜終了(秒)', fixed: true, defaultVisible: true },
    { id: 'status', label: '採否', fixed: true, defaultVisible: true },
];

const OPTIONAL_COLUMNS: ColumnDefinition[] = [
    { id: 'source', label: '抽出根拠', fixed: false, defaultVisible: false },
];

const ALL_COLUMNS: ColumnDefinition[] = [...FIXED_COLUMNS, ...OPTIONAL_COLUMNS];

describe('useColumnVisibility', () => {
    it('defaultVisible が true の列は初期状態で表示される', () => {
        const { result } = renderHook(() => useColumnVisibility(ALL_COLUMNS));

        expect(result.current.visibilityMap['order']).toBe(true);
        expect(result.current.visibilityMap['time']).toBe(true);
        expect(result.current.visibilityMap['status']).toBe(true);
    });

    it('defaultVisible が false の列は初期状態で非表示になる', () => {
        const { result } = renderHook(() => useColumnVisibility(ALL_COLUMNS));

        expect(result.current.visibilityMap['source']).toBe(false);
    });

    it('visibilityMap に全列の id がキーとして含まれる', () => {
        const { result } = renderHook(() => useColumnVisibility(ALL_COLUMNS));

        expect(Object.keys(result.current.visibilityMap)).toEqual(['order', 'time', 'status', 'source']);
    });

    it('toggleColumn を呼び出すと表示状態が反転する（false → true）', () => {
        const { result } = renderHook(() => useColumnVisibility(ALL_COLUMNS));

        expect(result.current.visibilityMap['source']).toBe(false);

        act(() => {
            result.current.toggleColumn('source');
        });

        expect(result.current.visibilityMap['source']).toBe(true);
    });

    it('toggleColumn を呼び出すと表示状態が反転する（true → false）', () => {
        const { result } = renderHook(() => useColumnVisibility(ALL_COLUMNS));

        expect(result.current.visibilityMap['order']).toBe(true);

        act(() => {
            result.current.toggleColumn('order');
        });

        expect(result.current.visibilityMap['order']).toBe(false);
    });

    it('toggleColumn を2回呼び出すと元の状態に戻る', () => {
        const { result } = renderHook(() => useColumnVisibility(ALL_COLUMNS));

        act(() => {
            result.current.toggleColumn('source');
        });
        expect(result.current.visibilityMap['source']).toBe(true);

        act(() => {
            result.current.toggleColumn('source');
        });
        expect(result.current.visibilityMap['source']).toBe(false);
    });

    it('他の列の表示状態に影響を与えずに特定列のみトグルできる', () => {
        const { result } = renderHook(() => useColumnVisibility(ALL_COLUMNS));

        act(() => {
            result.current.toggleColumn('source');
        });

        expect(result.current.visibilityMap['order']).toBe(true);
        expect(result.current.visibilityMap['time']).toBe(true);
        expect(result.current.visibilityMap['status']).toBe(true);
        expect(result.current.visibilityMap['source']).toBe(true);
    });

    it('空の配列を渡すと空の visibilityMap が返る', () => {
        const { result } = renderHook(() => useColumnVisibility([]));

        expect(result.current.visibilityMap).toEqual({});
    });

    it('固定列のみ渡すと固定列の visibilityMap が返る', () => {
        const { result } = renderHook(() => useColumnVisibility(FIXED_COLUMNS));

        expect(result.current.visibilityMap).toEqual({
            order: true,
            time: true,
            status: true,
        });
    });
});
