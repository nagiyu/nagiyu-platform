# PWA 設定ガイド

## 目的

本ドキュメントは、PWA（Progressive Web Apps）対応の方針と実装ガイドラインを定義する。

## 基本方針

- **デフォルトで有効**: スマホファースト思想に基づき、原則としてPWA対応
- **オプトアウト可能**: サービスの性質に応じて無効化可能
- **ユーザー体験優先**: インストール可能性とオフライン動作を提供

## PWA のメリット

### ユーザー視点

- **ホーム画面追加**: アプリのようにアクセス可能
- **オフライン動作**: ネットワーク不安定時も利用可能
- **高速な起動**: キャッシュによる即座の表示
- **プッシュ通知**: 重要な更新を通知（実装次第）

### 開発者視点

- **ストア不要**: App StoreやGoogle Play不要で配布可能
- **自動更新**: ブラウザキャッシュの更新で最新版を提供
- **シンプルな配布**: URLを共有するだけ

## デフォルトで有効にする理由

### スマホファースト思想

- モバイルユーザーを第一優先
- PWAはモバイルUXを大幅に向上
- デスクトップでも機能するため互換性の問題なし

### 実装コストの低さ

- next-pwaによる簡単な設定
- Service Workerの自動生成
- 最小限の実装で高い効果

## PWA 設定の詳細

### 必須ファイル

#### public/manifest.json

アプリのメタデータを定義。

```json
{
    "name": "サービス名 - 説明",
    "short_name": "短縮名",
    "start_url": "/",
    "display": "standalone",
    "theme_color": "#1976d2",
    "icons": [
        {
            "src": "/icon-192x192.png",
            "sizes": "192x192",
            "type": "image/png"
        },
        {
            "src": "/icon-512x512.png",
            "sizes": "512x512",
            "type": "image/png"
        }
    ]
}
```

#### public/icon-*.png

- 192x192: 最小サイズ
- 512x512: 推奨サイズ

#### app/offline/page.tsx

ネットワーク切断時のフォールバックページ。

### next-pwa 設定

#### next.config.ts

```typescript
import withPWA from 'next-pwa';

export default withPWA({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    register: true,
    skipWaiting: true,
})(nextConfig);
```

#### 設定のポイント

- `disable: development`: 開発時は無効化（高速リロード優先）
- `register: true`: Service Worker自動登録
- `skipWaiting: true`: 更新時に即座に新バージョン適用

## PWA を無効化すべきケース

### 認証必須の管理画面

- オフライン動作が意味をなさない
- Service Workerによるキャッシュが不要
- セキュリティ上の懸念（機密情報のキャッシュ）

### サーバーサイドレンダリングが重要

- 常に最新データが必要
- キャッシュによる古いデータ表示が問題
- SEOがクリティカル（ただしPWAでも可能）

### リアルタイム性が必須

- 株価表示、チャットアプリ等
- オフライン動作が誤解を招く

## 無効化手順

### 1. next-pwa の削除

```bash
npm uninstall next-pwa
```

### 2. next.config.ts の修正

withPWA を削除し、通常の設定に戻す。

### 3. 不要ファイルの削除

- `public/manifest.json`
- `public/icon-*.png`
- `app/offline/page.tsx`

### 4. layout.tsx の修正

manifest へのリンクを削除。

```typescript
// 削除
<link rel="manifest" href="/manifest.json" />
```

## オプション機能

### Share Target API

他アプリからのデータ共有を受け取る。

```json
{
    "share_target": {
        "action": "/some-path",
        "method": "GET",
        "params": {
            "title": "title",
            "text": "text",
            "url": "url"
        }
    }
}
```

#### 適用ケース

- テキスト処理ツール
- URLの変換・短縮サービス
- メモアプリ

### カスタムキャッシュ戦略

next-pwaのデフォルトで多くの場合は十分だが、必要に応じてカスタマイズ可能。

## テスト

### PWA 機能のテスト

E2Eテストで以下を確認：

- オフライン時のフォールバック表示
- manifest.json の正しい読み込み
- Service Worker の登録

### デバッグ

- Chrome DevTools > Application タブ
- Lighthouse でPWAスコア確認
- オフラインモードでの動作確認

## 参考

- [rules.md](./rules.md): コーディング規約・べからず集
- [service-template.md](./service-template.md): サービステンプレート
- [testing.md](./testing.md): テスト戦略
