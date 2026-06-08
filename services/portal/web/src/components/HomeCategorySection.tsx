import Link from 'next/link';
import { Box, Typography, Grid, Card, CardContent, CardActions } from '@mui/material';
import { Button } from '@nagiyu/ui';
import type { TechCategoryMeta } from '@/types/content';

interface HomeCategorySectionProps {
  /** カテゴリ別ハブのメタデータ一覧 */
  categories: TechCategoryMeta[];
}

/**
 * トップページのカテゴリ導線セクション
 *
 * A2 で作成された 3 ハブ（aws / nextjs / dev-stack）へのカード型リンクを表示する。
 * URL 仕様: `/tech/category/{slug}/`
 */
export default function HomeCategorySection({ categories }: HomeCategorySectionProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <Box component="section" sx={{ mb: 6 }}>
      <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 1, fontWeight: 600 }}>
        技術カテゴリ
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        テーマ別に深堀りした記事群をまとめています。気になるカテゴリから読み始めてください。
      </Typography>
      <Grid container spacing={3}>
        {categories.map((category) => (
          <Grid size={{ xs: 12, sm: 4 }} key={category.slug}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.2s',
                '&:hover': { boxShadow: 4 },
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                  {category.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  {category.description.length > 100
                    ? `${category.description.slice(0, 100)}…`
                    : category.description}
                </Typography>
              </CardContent>
              <CardActions>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/tech/category/${category.slug}/`}>カテゴリを見る</Link>
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
