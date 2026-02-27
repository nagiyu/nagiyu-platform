'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  TextField,
} from '@mui/material';

interface VideoListFiltersProps {
  favoriteFilter: string;
  skipFilter: string;
  searchKeyword: string;
  onFavoriteFilterChange: (value: string) => void;
  onSkipFilterChange: (value: string) => void;
  onSearch: (value: string) => void;
}

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

  const handleFavoriteChange = (event: SelectChangeEvent) => {
    onFavoriteFilterChange(event.target.value);
  };

  const handleSkipChange = (event: SelectChangeEvent) => {
    onSkipFilterChange(event.target.value);
  };

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
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel id="favorite-filter-label">お気に入り</InputLabel>
        <Select
          labelId="favorite-filter-label"
          id="favorite-filter"
          value={favoriteFilter}
          label="お気に入り"
          onChange={handleFavoriteChange}
        >
          <MenuItem value="all">すべて</MenuItem>
          <MenuItem value="true">お気に入りのみ</MenuItem>
          <MenuItem value="false">お気に入り以外</MenuItem>
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel id="skip-filter-label">スキップ</InputLabel>
        <Select
          labelId="skip-filter-label"
          id="skip-filter"
          value={skipFilter}
          label="スキップ"
          onChange={handleSkipChange}
        >
          <MenuItem value="all">すべて</MenuItem>
          <MenuItem value="false">通常動画のみ</MenuItem>
          <MenuItem value="true">スキップ動画のみ</MenuItem>
        </Select>
      </FormControl>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          value={inputKeyword}
          onChange={(event) => setInputKeyword(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="動画タイトルで検索"
          sx={{ minWidth: 240 }}
        />
        <Button variant="contained" size="small" onClick={handleSearch}>
          検索
        </Button>
      </Box>
    </Box>
  );
}
