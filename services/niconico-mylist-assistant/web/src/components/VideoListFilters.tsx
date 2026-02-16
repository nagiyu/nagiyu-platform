'use client';

import { Box, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent } from '@mui/material';

interface VideoListFiltersProps {
  favoriteFilter: string;
  skipFilter: string;
  onFavoriteFilterChange: (value: string) => void;
  onSkipFilterChange: (value: string) => void;
}

/**
 * 動画一覧フィルターコンポーネント
 *
 * お気に入りとスキップのフィルター機能を提供します。
 */
export default function VideoListFilters({
  favoriteFilter,
  skipFilter,
  onFavoriteFilterChange,
  onSkipFilterChange,
}: VideoListFiltersProps) {
  const handleFavoriteChange = (event: SelectChangeEvent) => {
    onFavoriteFilterChange(event.target.value);
  };

  const handleSkipChange = (event: SelectChangeEvent) => {
    onSkipFilterChange(event.target.value);
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
    </Box>
  );
}
