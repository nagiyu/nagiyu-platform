# Codec Converter（コーデックコンバータ）

Next.js で構築された動画コーデック変換サービスです。

## はじめに

まず、ワークスペースのルートから依存関係をインストールします：

```bash
cd /path/to/nagiyu-platform
npm install
```

次に、開発サーバーを起動します：

```bash
cd services/codec-converter
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いて結果を確認してください。

`app/page.tsx` を編集してページを変更できます。ファイルを編集すると自動的にページが更新されます。

## 詳細情報

Next.js について詳しく知りたい場合は、以下のリソースを参照してください：

- [Next.js ドキュメント](https://nextjs.org/docs) - Next.js の機能と API について学ぶ
- [Next.js チュートリアル](https://nextjs.org/learn) - インタラクティブな Next.js チュートリアル

[Next.js GitHub リポジトリ](https://github.com/vercel/next.js)もご覧ください。フィードバックや貢献を歓迎します！

## ビルド

本番用ビルドを作成するには：

```bash
npm run build
```

本番サーバーを起動するには：

```bash
npm start
```

## プロジェクト構成

本サービスは nagiyu-platform モノレポの一部であり、`specs/002-add-codec-converter/` で定義されたアーキテクチャに従っています。

詳細なドキュメントについては、以下を参照してください：
- 仕様: `specs/002-add-codec-converter/spec.md`
- 実装計画: `specs/002-add-codec-converter/plan.md`
- タスク: `specs/002-add-codec-converter/tasks.md`
