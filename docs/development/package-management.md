# パッケージ管理方針

## 目的

本ドキュメントは、プラットフォームにおける npm パッケージの管理方針を定義する。

## 基本方針

- **マイナー／パッチ更新を優先**: 定期メンテナンスではマイナー・パッチバージョンのみを対象とする
- **メジャー更新は別タスク**: 破壊的変更を伴うメジャーバージョンアップは独立したタスクで対応する
- **段階的更新**: カテゴリ（フレームワーク、ライブラリ、型定義など）ごとに更新し、各段階でビルドとテストを確認してから次に進む
- **意図的な固定は変更しない**: ベータ版等の理由で意図的に固定されているパッケージは更新対象外とする

## モノレポルート管理

### 方針

devDependencies は可能な限りモノレポルートで一元管理する。

複数ワークスペースで同一バージョンを使用している devDependencies はルートの devDependencies に移動し、各ワークスペースから削除することを推奨する。

### 理由

- バージョン不一致による不整合を防ぐ
- 依存関係の把握と更新作業を集約できる
- ワークスペースごとの重複インストールを回避できる

### 例外

ワークスペース固有の設定や、バージョンを分けることに明確な理由がある場合はワークスペース側で管理する。

## セキュリティ対応（npm overrides）

### 方針

直接依存ではなく transitive 依存として引き込まれるパッケージに脆弱性がある場合は、`package.json` の `overrides` フィールドで安全なバージョンに上書きする。

### 考え方

- overrides はあくまで暫定対処であり、恒久的な解決策ではない
- 直接依存パッケージ側が修正版をリリースした場合は、overrides を削除して通常の依存解決に戻すことが望ましい
- Critical・High レベルの脆弱性を対象とし、直接依存のバージョンアップでも、依存元の範囲内での更新 (`npm update <パッケージ名>`) でも解決できない場合に限り適用する

### 対象となる脆弱性の例

以下のような脆弱性が overrides の対象となる：

- JavaScript Injection、Prototype Pollution（Critical / High）
- SSRF（Server-Side Request Forgery）（Critical）
- DoS、ReDoS（High）
- Method Injection（High / Moderate）

### 管理上の注意

- `package.json` にはコメントを書けないため、overrides の適用理由と参照元 (CVE や GitHub Advisory) は PR に残す。コードから意図を読み取れないものは、下記「脆弱性以外の overrides」のように本ドキュメントに残す
- 定期メンテナンスのタイミングで overrides の必要性を再確認し、不要になったものは削除する

### 脆弱性以外の overrides

#### playwright-core を @playwright/test と同じバージョンに揃える

`playwright-core` は `$@playwright/test` という参照で、ルートの `@playwright/test` と同じバージョンに固定している。

- **理由**: `@axe-core/playwright` が `playwright-core` を範囲の広い peerDependency で要求するため、`@playwright/test` とは別系統の新しい `playwright-core` が入ることがある。両者の `Page` 型が食い違うと、E2E テストの型チェックが失敗する
- **`$` 参照にした理由**: Playwright は `@playwright/test` と `playwright-core` を同じバージョン番号で揃えて出している。版を直接書くと、`@playwright/test` を更新するたびに overrides も手で直す必要があり、忘れると食い違いが再発する
- **前提**: `$` で参照できるのはルートの直接依存だけである。`@playwright/test` をルートの依存から外す場合は、この overrides も見直す

## 参考

- [monorepo-structure.md](./monorepo-structure.md): モノレポ全体の構造
- [rules.md](./rules.md): コーディング規約
- [architecture.md](./architecture.md): アーキテクチャ方針
