import { renderToStaticMarkup } from 'react-dom/server';
import AboutPage from '@/app/about/page';
import Base64Page, { metadata as base64Metadata } from '@/app/base64/page';
import HashGeneratorPage, { metadata as hashGeneratorMetadata } from '@/app/hash-generator/page';
import JsonFormatterPage, { metadata as jsonFormatterMetadata } from '@/app/json-formatter/page';
import HomePage, { metadata as homeMetadata } from '@/app/page';
import TimestampConverterPage, { metadata as timestampConverterMetadata } from '@/app/timestamp-converter/page';
import TransitConverterLayout from '@/app/transit-converter/layout';
import UrlEncoderPage, { metadata as urlEncoderMetadata } from '@/app/url-encoder/page';
import {
  homeStructuredData,
  jsonFormatterStructuredData,
  toJsonLd,
  transitConverterStructuredData,
} from '@/lib/structuredData';

jest.mock('@/app/json-formatter/JsonFormatterClient', () => {
  const MockJsonFormatterClient = () => <div>dummy</div>;

  return MockJsonFormatterClient;
});

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

    expect(homeMetadata.description).toContain(
      '乗り換え変換ツール、JSON整形ツール、VAPIDキー生成ツール、Base64エンコーダー/デコーダー、URLエンコーダー/デコーダー、ハッシュ生成ツール'
    );
    expect(homeMetadata.description).toContain(
      '機能に応じてブラウザ内処理とサーバー処理を使い分けており、PWA対応でオフライン環境でも一部機能を利用できます。'
    );
    expect(homeHtml).toContain('APIレスポンスや設定データの確認作業を効率化します。');
    expect(homeHtml).toContain('VAPID キー生成ツール');
    expect(homeHtml).toContain('Base64 エンコーダー / デコーダー');
    expect(homeHtml).toContain('URL エンコーダー / デコーダー');
    expect(homeHtml).toContain('ハッシュ生成ツール');
    expect(homeHtml).toContain('タイムスタンプ変換ツール');
    expect(homeHtml).toContain(
      'VAPIDキー生成ツールではWeb Push通知の実装に必要な鍵ペアをすぐに用意できます。 Base64エンコーダー/デコーダーでは文字列の相互変換を簡単に行えます。 URLエンコーダー/デコーダーではクエリやパラメータに使う文字列を扱いやすく変換できます。 ハッシュ生成ツールではSHA-256 / SHA-512のハッシュ値をすばやく確認できます。'
    );
    expect(homeHtml).toContain(
      'VAPIDキー生成ツールは入力データなしで、サーバー上で鍵ペアを生成します。'
    );
    expect(homeHtml).toContain(
      '乗り換え変換ツール・JSON整形ツール・Base64エンコーダー/デコーダー・URLエンコーダー/デコーダー・ハッシュ生成ツールはブラウザ内で動作し、入力データは外部に送信されません。'
    );
    expect(homeHtml).toContain('サーバー通信が不要な基本機能を利用でき');
    expect(homeHtml).toContain(
      'VAPIDキー生成はサーバーで鍵を作成するため、各ツールの特性に応じて処理方式が異なります。'
    );
    expect(homeHtml).toContain('通信が必要な機能はオンライン時にご利用ください。');
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

  it('JSON整形ツールページに WebApplication のJSON-LDが埋め込まれている', () => {
    const jsonFormatterHtml = renderToStaticMarkup(JsonFormatterPage());

    expect(jsonFormatterHtml).toContain('application/ld+json');
    expect(jsonFormatterHtml).toContain(toJsonLd(jsonFormatterStructuredData));
  });

  it('base64ページのmetadata descriptionにエンコード/デコード用途が含まれる', () => {
    const base64Html = renderToStaticMarkup(Base64Page());

    expect(base64Metadata.description).toContain('エンコード');
    expect(base64Metadata.description).toContain('デコード');
    expect(base64Html).toContain('Base64 エンコーダー / デコーダー');
  });

  it('url-encoderページのmetadata descriptionにエンコード/デコード用途が含まれる', () => {
    const urlEncoderHtml = renderToStaticMarkup(UrlEncoderPage());

    expect(urlEncoderMetadata.description).toContain('エンコード');
    expect(urlEncoderMetadata.description).toContain('デコード');
    expect(urlEncoderHtml).toContain('URL エンコーダー / デコーダー');
  });

  it('hash-generatorページのmetadata descriptionにハッシュ用途が含まれる', () => {
    const hashGeneratorHtml = renderToStaticMarkup(HashGeneratorPage());

    expect(hashGeneratorMetadata.description).toContain('SHA-256 / SHA-512');
    expect(hashGeneratorMetadata.description).toContain('Hex');
    expect(hashGeneratorHtml).toContain('ハッシュ生成ツール');
  });

  it('timestamp-converterページのmetadata descriptionに相互変換用途が含まれる', () => {
    const timestampConverterHtml = renderToStaticMarkup(TimestampConverterPage());

    expect(timestampConverterMetadata.description).toContain('Unixタイムスタンプ');
    expect(timestampConverterMetadata.description).toContain('相互');
    expect(timestampConverterHtml).toContain('タイムスタンプ変換ツール');
  });
});
