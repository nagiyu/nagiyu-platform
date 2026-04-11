import { useCallback, useState } from 'react';
import type { ColumnDefinition } from '../constants/highlightTableColumns';

export type ColumnVisibilityMap = Record<string, boolean>;

export type UseColumnVisibilityReturn = {
    /** 各列の現在の表示状態（id → boolean のマップ） */
    visibilityMap: ColumnVisibilityMap;
    /** 特定列の表示状態をトグルする関数 */
    toggleColumn: (id: string) => void;
};

/**
 * テーブル列の表示・非表示状態を管理するカスタムフック
 *
 * @param columns - 列定義の配列（`ColumnDefinition[]`）
 * @returns 列の表示状態マップとトグル関数
 */
export function useColumnVisibility(columns: ColumnDefinition[]): UseColumnVisibilityReturn {
    const [visibilityMap, setVisibilityMap] = useState<ColumnVisibilityMap>(() =>
        Object.fromEntries(columns.map((col) => [col.id, col.defaultVisible]))
    );

    const toggleColumn = useCallback((id: string) => {
        setVisibilityMap((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    }, []);

    return { visibilityMap, toggleColumn };
}
