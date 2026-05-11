'use client';

import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { Button, Select, TextField, type SelectOption } from '@nagiyu/ui';

interface VideoListFiltersProps {
  favoriteFilter: string;
  skipFilter: string;
  searchKeyword: string;
  onFavoriteFilterChange: (value: string) => void;
  onSkipFilterChange: (value: string) => void;
  onSearch: (value: string) => void;
}

const FAVORITE_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'all', label: 'すべて' },
  { value: 'true', label: 'お気に入りのみ' },
  { value: 'false', label: 'お気に入り以外' },
];

const SKIP_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'all', label: 'すべて' },
  { value: 'false', label: '通常動画のみ' },
  { value: 'true', label: 'スキップ動画のみ' },
];

/**
 * 動画一覧フィルターコンポーネント
 *
 * お気に入りとスキップのフィルター機能を提供します。
 */
export default function VideoListFilters({
  favoriteFilter,
  skipFilter,
  searchKeyword,
  onFavoriteFilterChange,
  onSkipFilterChange,
  onSearch,
}: VideoListFiltersProps) {
  const [inputKeyword, setInputKeyword] = useState<string>(searchKeyword);

  // URLからの状態復元（ブラウザバック/フォワード・直接URL入力）時に入力欄を同期する
  useEffect(() => {
    setInputKeyword(searchKeyword);
  }, [searchKeyword]);

  const handleSearch = () => {
    onSearch(inputKeyword);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        mb: 3,
      }}
    >
      <Box sx={{ minWidth: 200 }}>
        <Select
          id="favorite-filter"
          label="お気に入り"
          size="sm"
          value={favoriteFilter}
          onChange={onFavoriteFilterChange}
          options={FAVORITE_OPTIONS}
          fullWidth
        />
      </Box>

      <Box sx={{ minWidth: 200 }}>
        <Select
          id="skip-filter"
          label="スキップ"
          size="sm"
          value={skipFilter}
          onChange={onSkipFilterChange}
          options={SKIP_OPTIONS}
          fullWidth
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, minWidth: 240 }}>
        <TextField
          size="sm"
          value={inputKeyword}
          onChange={(event) => setInputKeyword(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="動画タイトルで検索"
          fullWidth
        />
        <Button variant="solid" size="sm" onClick={handleSearch}>
          検索
        </Button>
      </Box>
    </Box>
  );
}
