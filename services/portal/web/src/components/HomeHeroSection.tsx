import Link from 'next/link';
import { Box, Typography, Stack, Divider } from '@mui/material';
import { Button } from '@nagiyu/ui';

interface HomeHeroSectionProps {
  /** 公開済み技術記事の総数 */
  articleCount: number;
  /** 運営サービスの数 */
  serviceCount: number;
  /** 技術カテゴリ（ハブ）の数 */
  categoryCount: number;
}

/**
 * トップページのヒーローセクション
 *
 * 初訪問者に「誰が・何を・どのくらい」発信しているサイトかを
 * 8 秒程度で伝えることを目的とした、ファーストビュー専用コンポーネント。
 */
export default function HomeHeroSection({
  articleCount,
  serviceCount,
  categoryCount,
}: HomeHeroSectionProps) {
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
        sx={{ maxWidth: 680, mx: 'auto', mb: 3, lineHeight: 1.8 }}
      >
        AWS・Next.js を主軸としたフルスタック開発のノウハウと、
        自作ツール群の使い方ガイドを発信する個人技術ポータルです。
        設計の意図と実装の詳細を、運用視点で記録しています。
      </Typography>

      {/* サイト統計バッジ */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 2, sm: 0 }}
        divider={
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
        }
        sx={{ mb: 4, justifyContent: 'center', alignItems: 'center' }}
      >
        <Box sx={{ px: 3, textAlign: 'center' }}>
          <Typography variant="h4" component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>
            {articleCount}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            技術記事
          </Typography>
        </Box>
        <Box sx={{ px: 3, textAlign: 'center' }}>
          <Typography variant="h4" component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>
            {serviceCount}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            自作サービス
          </Typography>
        </Box>
        <Box sx={{ px: 3, textAlign: 'center' }}>
          <Typography variant="h4" component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>
            {categoryCount}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            技術カテゴリ
          </Typography>
        </Box>
      </Stack>

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
