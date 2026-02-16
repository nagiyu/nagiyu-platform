'use client';

import { Box, Pagination as MuiPagination, Typography } from '@mui/material';

interface VideoListPaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
}

/**
 * 動画一覧ページネーションコンポーネント
 *
 * offset/limit 方式のページネーション機能を提供します。
 */
export default function VideoListPagination({
  total,
  limit,
  offset,
  onPageChange,
}: VideoListPaginationProps) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const handleChange = (_event: React.ChangeEvent<unknown>, page: number) => {
    const newOffset = (page - 1) * limit;
    onPageChange(newOffset);
  };

  if (totalPages <= 1) {
    return null;
  }

  const start = offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        mt: 4,
        mb: 2,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {total} 件中 {start} - {end} 件を表示
      </Typography>
      <MuiPagination
        count={totalPages}
        page={currentPage}
        onChange={handleChange}
        color="primary"
        size="medium"
        showFirstButton
        showLastButton
      />
    </Box>
  );
}
