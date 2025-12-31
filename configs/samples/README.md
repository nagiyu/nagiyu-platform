# TypeScript サンプル設定ファイル

このディレクトリには、新しいサービスを作成する際のテンプレートとなる TypeScript 設定ファイルが含まれています。

**重要**: これらのファイルに含まれる相対パスは、`services/{service}/core`、`services/{service}/web`、`services/{service}/batch` に配置されることを前提としています。

## ファイル一覧

### tsconfig.core.json
**対象**: `services/{service}/core` パッケージ

ビジネスロジック用の設定。TypeScript Project References 対応。

**特徴**:
- `composite: true` でビルド可能
- `declaration: true` で型定義ファイル生成
- `libs/common` への参照を含む
- テストファイルも型チェック対象

**使用例**:
```bash
cp configs/samples/tsconfig.core.json services/myservice/core/tsconfig.json
```

### tsconfig.web.json
**対象**: `services/{service}/web` パッケージ

Next.js アプリケーション用の設定。

**特徴**:
- Next.js プラグイン設定済み
- `noEmit: true` でビルド出力なし（Next.js が管理）
- パスエイリアス `@/*` 設定済み
- core, libs への参照を含む
- E2E テストは除外

**使用例**:
```bash
cp configs/samples/tsconfig.web.json services/myservice/web/tsconfig.json
```

### tsconfig.batch.json
**対象**: `services/{service}/batch` パッケージ

バッチ処理用の設定。TypeScript Project References 対応。

**特徴**:
- `composite: true` でビルド可能（Lambda デプロイ用）
- `declaration: true` で型定義ファイル生成
- core, libs/common への参照を含む
- テストファイルも型チェック対象

**使用例**:
```bash
cp configs/samples/tsconfig.batch.json services/myservice/batch/tsconfig.json
```

## TypeScript Project References について

TypeScript Project References を使用することで、以下の利点があります:

- **増分ビルド**: 変更があったパッケージのみビルド
- **型情報の共有**: パッケージ間で型定義を共有
- **エディタ補完の改善**: IDE での型補完が高速化

### 依存関係の設定

`references` フィールドで依存するパッケージを指定します:

```json
{
  "references": [
    { "path": "../core" },
    { "path": "../../../libs/common" }
  ]
}
```

### 依存方向のルール

依存は常に下位レイヤー（より汎用的なパッケージ）へ向かう:

```
services/{service}/web → services/{service}/core → libs/common
                       → libs/ui → libs/browser → libs/common
services/{service}/batch → services/{service}/core → libs/common
```

## カスタマイズ

サービスの要件に応じて、以下をカスタマイズできます:

- `lib`: 使用する JavaScript ライブラリ（DOM, ES2020 等）
- `paths`: パスエイリアス（web パッケージのみ）
- `include`/`exclude`: 型チェック対象ファイル
- `references`: 依存するパッケージ

## 参考

- [モノレポ構成](../../docs/development/monorepo-structure.md)
- [共通設定ファイル](../../docs/development/configs.md)
- [TypeScript Project References (公式)](https://www.typescriptlang.org/docs/handbook/project-references.html)
