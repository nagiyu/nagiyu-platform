import type { Metadata } from 'next';
import { Container } from '@mui/material';
import { getAllArticles, getFeaturedArticles } from '@/lib/content';
import { buildOrganizationJsonLd, buildWebSiteJsonLd, jsonLdScript } from '@/lib/jsonLd';
import HomeHeroSection from '@/components/HomeHeroSection';
import HomeFeaturedSection from '@/components/HomeFeaturedSection';
import HomeLatestArticlesSection from '@/components/HomeLatestArticlesSection';

export const metadata: Metadata = {
  title: 'nagiyu - AWS と個人開発の実運用ノート',
  description:
    '個人で複数の Web サービスを AWS 上で開発・運用する中で、実際に踏んだ失敗と、その場で下した判断を記録している技術メディアです。',
  alternates: {
    canonical: 'https://nagiyu.com',
  },
};

export default async function HomePage() {
  const featuredArticles = getFeaturedArticles(3);
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

      {/* 1. ヒーローセクション：技術メディアであることを数秒で伝える */}
      <HomeHeroSection />

      {/* 2. 特集記事：featured: true の記事（0 件時は非表示） */}
      <HomeFeaturedSection articles={featuredArticles} />

      {/* 3. 最新記事リスト：最新 6 本 */}
      <HomeLatestArticlesSection articles={latestArticles} />
    </Container>
  );
}
