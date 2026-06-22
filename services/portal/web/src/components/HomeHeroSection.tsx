import Link from 'next/link';
import { Box, Typography, Stack } from '@mui/material';
import { Button } from '@nagiyu/ui';

/**
 * トップページのヒーローセクション
 *
 * 初訪問者に「個人開発者による実運用ベースの技術メディア」であることを
 * 数秒で伝えることを目的とした、ファーストビュー専用コンポーネント。
 */
export default function HomeHeroSection() {
  return (
    <Box
      component="section"
      sx={{
        mb: 6,
        py: { xs: 5, md: 8 },
        px: { xs: 2, md: 4 },
        textAlign: 'center',
        borderRadius: 2,
        bgcolor: 'grey.50',
        border: '1px solid',
        borderColor: 'grey.200',
      }}
    >
      {/* サイト名 */}
      <Typography
        variant="h3"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 700, letterSpacing: '-0.5px' }}
      >
        nagiyu
      </Typography>

      {/* キャッチコピー */}
      <Typography
        variant="h6"
        component="p"
        color="text.secondary"
        sx={{ maxWidth: 680, mx: 'auto', mb: 4, lineHeight: 1.8 }}
      >
        個人開発者による、実運用ベースの技術メディアです。 AWS・Next.js
        を主軸としたフルスタック開発で実際に直面した
        設計判断と実装の詳細を、運用視点で記録しています。
      </Typography>

      {/* CTA ボタン */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'center' }}>
        <Button asChild variant="solid">
          <Link href="/tech">技術記事を読む</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/about">nagiyu について</Link>
        </Button>
      </Stack>
    </Box>
  );
}
