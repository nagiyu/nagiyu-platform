import type { Metadata } from 'next';
import { Container } from '@mui/material';
import {
  getAllArticles,
  getFeaturedArticles,
  getAllTechCategoryMetas,
  getSiteStats,
} from '@/lib/content';
import { buildOrganizationJsonLd, buildWebSiteJsonLd, jsonLdScript } from '@/lib/jsonLd';
import HomeHeroSection from '@/components/HomeHeroSection';
import HomeFeaturedSection from '@/components/HomeFeaturedSection';
import HomeCategorySection from '@/components/HomeCategorySection';
import HomeLatestArticlesSection from '@/components/HomeLatestArticlesSection';

export const metadata: Metadata = {
  title: 'nagiyu - AWS・Next.js 技術メディア',
  description:
    '個人開発者による実運用ベースの技術メディア。AWS・Next.js を主軸としたフルスタック開発で実際に直面した設計判断・実装の詳細・運用知見を記録しています。',
  alternates: {
    canonical: 'https://nagiyu.com',
  },
};

export default async function HomePage() {
  // 各セクション用データを取得
  const stats = getSiteStats();
  const featuredArticles = getFeaturedArticles(3);
  const categories = getAllTechCategoryMetas();
  // 最新記事は既存の 6 件踏襲
  const latestArticles = getAllArticles().slice(0, 6);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildWebSiteJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildOrganizationJsonLd()) }}
      />

      {/* 1. ヒーローセクション：技術メディアであることと規模を数秒で伝える */}
      <HomeHeroSection articleCount={stats.articleCount} categoryCount={stats.categoryCount} />

      {/* 2. 特集記事：featured: true の記事（0 件時は非表示） */}
      <HomeFeaturedSection articles={featuredArticles} />

      {/* 3. カテゴリ導線：A2 作成の 3 ハブへのカード型リンク */}
      <HomeCategorySection categories={categories} />

      {/* 4. 最新記事リスト：最新 6 本 */}
      <HomeLatestArticlesSection articles={latestArticles} />
    </Container>
  );
}
