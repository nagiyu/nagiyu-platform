import { renderToStaticMarkup } from 'react-dom/server';
import AboutPage from '@/app/about/page';
import HomePage, { metadata as homeMetadata } from '@/app/page';
import { metadata as jsonFormatterMetadata } from '@/app/json-formatter/page';
import TransitConverterLayout from '@/app/transit-converter/layout';
import { homeStructuredData, toJsonLd, transitConverterStructuredData } from '@/lib/structuredData';

describe('コンテンツ整合性', () => {
  it('aboutページの提供ツールにJSON整形ツールが含まれる', () => {
    const html = renderToStaticMarkup(AboutPage());

    expect(html).toContain('JSON 整形ツール');
    expect(html).toContain('乗り換え変換ツール');
  });

  it('aboutページの今後の展望からJSONフォーマッター表記が削除されている', () => {
    const html = renderToStaticMarkup(AboutPage());

    expect(html).not.toContain('JSON フォーマッター');
  });

  it('json-formatterページのmetadata descriptionが詳細化されている', () => {
    expect(jsonFormatterMetadata.description).toContain('整形（Pretty Print）');
    expect(jsonFormatterMetadata.description).toContain('APIレスポンス');
  });

  it('ホームページのmetadataと主要説明文が提供中ツールに整合する', () => {
    const homeHtml = renderToStaticMarkup(HomePage());

    expect(homeMetadata.description).toContain('乗り換え変換ツールとJSON整形ツール');
    expect(homeHtml).toContain('APIレスポンスや設定データの確認作業を効率化します。');
  });

  it('ホームページに WebSite / SoftwareApplication のJSON-LDが埋め込まれている', () => {
    const homeHtml = renderToStaticMarkup(HomePage());

    expect(homeHtml).toContain('application/ld+json');
    expect(homeHtml).toContain(toJsonLd(homeStructuredData));
  });

  it('乗り換え変換ツールページに WebApplication のJSON-LDが埋め込まれている', () => {
    const transitHtml = renderToStaticMarkup(
      TransitConverterLayout({
        children: <div>dummy</div>,
      })
    );

    expect(transitHtml).toContain('application/ld+json');
    expect(transitHtml).toContain(toJsonLd(transitConverterStructuredData));
  });
});
