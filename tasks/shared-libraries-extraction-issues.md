# 共通ライブラリ抽出 - Issue作成リスト

このドキュメントは、共通ライブラリ抽出プロジェクトのGitHub Issue作成用タスクリストです。
各IssueはGitHub Copilot Agent（`.github/agents/task.implement.agent.md`）で実装されます。

**親タスク**: `tasks/shared-libraries-extraction-roadmap.md`

---

## Phase 1: libs/common/ の作成

### Issue #1: libs/common パッケージの初期セットアップ

**タイトル**: `[libs/common] パッケージの初期セットアップ`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 1`

**説明**:
```markdown
## 概要
完全フレームワーク非依存の共通ライブラリパッケージ `@nagiyu/common` を作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 1

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/configs.md
- docs/development/testing.md

## タスク
- [ ] `libs/common/` ディレクトリ作成
- [ ] `libs/common/package.json` 作成（name: "@nagiyu/common", version: "1.0.0"）
- [ ] `libs/common/tsconfig.json` 作成（configs/tsconfig.base.json を extends）
- [ ] `libs/common/jest.config.ts` 作成（configs/jest.config.base.ts を extends）
- [ ] `libs/common/src/` ディレクトリ作成
- [ ] `libs/common/src/index.ts` 作成（エクスポートファイル）
- [ ] `libs/common/tests/unit/` ディレクトリ作成
- [ ] `libs/common/.gitignore` 作成
- [ ] `libs/common/README.md` 作成（パッケージ説明、使用方法）
- [ ] ビルドスクリプト追加（package.json）
- [ ] テストスクリプト追加（package.json）
- [ ] ビルドが成功することを確認
- [ ] テストが実行可能なことを確認
- [ ] CIワークフローに libs/common のテスト追加

## 完了基準
- パッケージビルドが成功
- `npm test` でテストが実行可能
- CIでテストが実行される
- READMEが充実している

## 備考
- 現時点では型定義や汎用ユーティリティは含まない（将来の拡張用の土台を作る）
- ライブラリ内部は相対パスのみ使用（パスエイリアス禁止）
```

---

## Phase 2: libs/browser/ の作成と抽出

### Issue #2: libs/browser パッケージの初期セットアップ

**タイトル**: `[libs/browser] パッケージの初期セットアップ`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 2`

**説明**:
```markdown
## 概要
ブラウザAPI依存のユーティリティライブラリパッケージ `@nagiyu/browser` を作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 2

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/configs.md
- docs/development/testing.md

## タスク
- [ ] `libs/browser/` ディレクトリ作成
- [ ] `libs/browser/package.json` 作成（name: "@nagiyu/browser", version: "1.0.0"）
- [ ] `libs/browser/tsconfig.json` 作成（configs/tsconfig.base.json を extends）
- [ ] `libs/browser/jest.config.ts` 作成（configs/jest.config.base.ts を extends）
- [ ] `libs/browser/src/` ディレクトリ作成
- [ ] `libs/browser/src/index.ts` 作成（エクスポートファイル）
- [ ] `libs/browser/tests/unit/` ディレクトリ作成
- [ ] `libs/browser/.gitignore` 作成
- [ ] `libs/browser/README.md` 作成（パッケージ説明、使用方法）
- [ ] `@nagiyu/common` への依存を追加（package.json）
- [ ] ビルドスクリプト追加（package.json）
- [ ] テストスクリプト追加（package.json）
- [ ] ビルドが成功することを確認
- [ ] CIワークフローに libs/browser のテスト追加

## 完了基準
- パッケージビルドが成功
- `npm test` でテストが実行可能
- CIでテストが実行される
- READMEが充実している

## 備考
- ライブラリ内部は相対パスのみ使用（パスエイリアス禁止）
```

---

### Issue #3: Clipboard API ラッパーの実装と移行

**タイトル**: `[libs/browser] Clipboard API ラッパーの実装と移行`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 2`

**説明**:
```markdown
## 概要
Toolsサービスの `clipboard.ts` を `@nagiyu/browser` に移行し、ユニットテストを作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 2

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/architecture.md
- docs/development/testing.md

## 元ファイル
services/tools/src/lib/clipboard.ts

## タスク
- [ ] `services/tools/src/lib/clipboard.ts` の内容を確認
- [ ] `libs/browser/src/clipboard.ts` に実装をコピー
- [ ] エラーハンドリングの適切性を確認
- [ ] `libs/browser/src/index.ts` に export を追加
- [ ] `libs/browser/tests/unit/clipboard.test.ts` 作成
- [ ] navigator.clipboard のモック作成
- [ ] readFromClipboard の正常系テスト
- [ ] readFromClipboard のエラー系テスト
- [ ] writeToClipboard の正常系テスト
- [ ] writeToClipboard のエラー系テスト
- [ ] テストカバレッジ80%以上を確認
- [ ] 全テストがパスすることを確認

## 完了基準
- clipboard.ts が libs/browser に実装されている
- 全テストがパス
- テストカバレッジ80%以上
- CIでテストが実行される

## 備考
- この段階ではToolsサービスからは削除しない（Phase 4で削除）
```

---

### Issue #4: localStorage ラッパーの実装

**タイトル**: `[libs/browser] localStorage ラッパーの実装`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 2`

**説明**:
```markdown
## 概要
localStorage の安全なラッパー関数を実装し、ユニットテストを作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 2

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/architecture.md
- docs/development/testing.md

## 参考実装
- services/tools/src/components/dialogs/MigrationDialog.tsx (localStorage使用例)
- services/tools/src/app/transit-converter/page.tsx (localStorage使用例)

## タスク
- [ ] `libs/browser/src/localStorage.ts` 作成
- [ ] getItem 関数の実装（SSR対応、エラーハンドリング）
- [ ] setItem 関数の実装（SSR対応、エラーハンドリング）
- [ ] removeItem 関数の実装（SSR対応、エラーハンドリング）
- [ ] 型安全なジェネリック対応（JSON.parse/stringify）
- [ ] `libs/browser/src/index.ts` に export を追加
- [ ] `libs/browser/tests/unit/localStorage.test.ts` 作成
- [ ] localStorage のモック作成
- [ ] getItem の正常系テスト
- [ ] getItem のSSR環境テスト（windowなし）
- [ ] getItem のエラー系テスト（プライベートモード等）
- [ ] setItem の正常系テスト
- [ ] setItem のクォータ超過テスト
- [ ] removeItem のテスト
- [ ] テストカバレッジ80%以上を確認
- [ ] 全テストがパスすることを確認

## 完了基準
- localStorage.ts が libs/browser に実装されている
- SSR対応が適切（ブラウザ環境チェック）
- 全テストがパス
- テストカバレッジ80%以上
- CIでテストが実行される

## API設計例
```typescript
// 基本的な使い方
export function getItem<T = string>(key: string): T | null;
export function setItem<T = string>(key: string, value: T): void;
export function removeItem(key: string): void;
```
```

---

## Phase 3: libs/ui/ の作成と抽出

### Issue #5: libs/ui パッケージの初期セットアップ

**タイトル**: `[libs/ui] パッケージの初期セットアップ`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 3`

**説明**:
```markdown
## 概要
Next.js + Material-UI 依存のUIコンポーネントライブラリパッケージ `@nagiyu/ui` を作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 3

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/configs.md
- docs/development/testing.md

## タスク
- [ ] `libs/ui/` ディレクトリ作成
- [ ] `libs/ui/package.json` 作成（name: "@nagiyu/ui", version: "1.0.0"）
- [ ] 依存関係追加: React, Next.js, Material-UI, Emotion
- [ ] `@nagiyu/browser` への依存を追加（package.json）
- [ ] `libs/ui/tsconfig.json` 作成（configs/tsconfig.base.json を extends）
- [ ] `libs/ui/jest.config.ts` 作成（configs/jest.config.base.ts を extends）
- [ ] `libs/ui/src/` ディレクトリ作成
- [ ] `libs/ui/src/index.ts` 作成（エクスポートファイル）
- [ ] `libs/ui/tests/unit/` ディレクトリ作成
- [ ] `libs/ui/.gitignore` 作成
- [ ] `libs/ui/README.md` 作成（パッケージ説明、使用方法）
- [ ] ビルドスクリプト追加（package.json）
- [ ] テストスクリプト追加（package.json）
- [ ] Testing Library セットアップ（jest.config.ts）
- [ ] ビルドが成功することを確認
- [ ] CIワークフローに libs/ui のテスト追加

## 完了基準
- パッケージビルドが成功
- `npm test` でテストが実行可能
- CIでテストが実行される
- READMEが充実している

## 備考
- ライブラリ内部は相対パスのみ使用（パスエイリアス禁止）
- Client Component として実装（'use client' ディレクティブ）
```

---

### Issue #6: theme.ts の移行

**タイトル**: `[libs/ui] theme.ts の移行`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 3`

**説明**:
```markdown
## 概要
Toolsサービスの `theme.ts` を `@nagiyu/ui` に移行する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 3

## 関連ドキュメント
- docs/development/shared-libraries.md

## 元ファイル
services/tools/src/styles/theme.ts

## タスク
- [ ] `services/tools/src/styles/theme.ts` の内容を確認
- [ ] `libs/ui/src/styles/` ディレクトリ作成
- [ ] `libs/ui/src/styles/theme.ts` に実装をコピー
- [ ] `libs/ui/src/index.ts` に export を追加
- [ ] テーマ設定の適切性を確認（カラーパレット、タイポグラフィ等）
- [ ] 必要に応じてコメント追加

## 完了基準
- theme.ts が libs/ui に実装されている
- Material-UIの createTheme が正しく動作する

## 備考
- この段階ではToolsサービスからは削除しない（Phase 4で削除）
- ユニットテストは不要（設定ファイルのため）
```

---

### Issue #7: Header コンポーネントの移行とテスト

**タイトル**: `[libs/ui] Header コンポーネントの移行とテスト`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 3`

**説明**:
```markdown
## 概要
Toolsサービスの Header コンポーネントを汎用化して `@nagiyu/ui` に移行し、テストを作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 3

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/testing.md

## 元ファイル
services/tools/src/components/layout/Header.tsx

## タスク
- [ ] `services/tools/src/components/layout/Header.tsx` の内容を確認
- [ ] `libs/ui/src/components/layout/` ディレクトリ作成
- [ ] `libs/ui/src/components/layout/Header.tsx` に実装をコピー
- [ ] サービス名を props で受け取るように汎用化
  - `title` prop 追加（デフォルト: "Nagiyu Platform"）
  - `href` prop 追加（デフォルト: "/"）
- [ ] `libs/ui/src/index.ts` に export を追加
- [ ] `libs/ui/tests/unit/components/layout/Header.test.tsx` 作成
- [ ] レンダリングテスト（デフォルトprops）
- [ ] カスタムタイトルのテスト
- [ ] カスタムhrefのテスト
- [ ] アクセシビリティ属性のテスト
- [ ] テストカバレッジ80%以上を確認
- [ ] 全テストがパスすることを確認

## 完了基準
- Header.tsx が libs/ui に実装されている
- propsで汎用化されている
- 全テストがパス
- テストカバレッジ80%以上

## 備考
- この段階ではToolsサービスからは削除しない（Phase 4で削除）
```

---

### Issue #8: Footer コンポーネントの移行とテスト

**タイトル**: `[libs/ui] Footer コンポーネントの移行とテスト`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 3`

**説明**:
```markdown
## 概要
Toolsサービスの Footer コンポーネントを汎用化して `@nagiyu/ui` に移行し、テストを作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 3

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/testing.md
- docs/development/shared-libraries.md（利用規約・プライバシーポリシーのダイアログ化）

## 元ファイル
services/tools/src/components/layout/Footer.tsx

## タスク
- [ ] `services/tools/src/components/layout/Footer.tsx` の内容を確認
- [ ] `libs/ui/src/components/layout/Footer.tsx` に実装をコピー
- [ ] version props の維持
- [ ] 利用規約・プライバシーポリシーのダイアログ化
  - リンククリックでダイアログ表示
  - ダイアログコンテンツはpropsで受け取る（将来対応）
  - 現時点では pointerEvents: 'none' を削除してクリック可能に
- [ ] `libs/ui/src/index.ts` に export を追加
- [ ] `libs/ui/tests/unit/components/layout/Footer.test.tsx` 作成
- [ ] レンダリングテスト（デフォルトversion）
- [ ] カスタムversionのテスト
- [ ] リンク表示のテスト
- [ ] テストカバレッジ80%以上を確認
- [ ] 全テストがパスすることを確認

## 完了基準
- Footer.tsx が libs/ui に実装されている
- version propsが正しく動作する
- 全テストがパス
- テストカバレッジ80%以上

## 備考
- この段階ではToolsサービスからは削除しない（Phase 4で削除）
- ダイアログ化は将来の拡張として設計のみ考慮（実装は後回し可）
```

---

### Issue #9: MigrationDialog コンポーネントの移行とテスト

**タイトル**: `[libs/ui] MigrationDialog コンポーネントの移行とテスト`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 3`

**説明**:
```markdown
## 概要
Toolsサービスの MigrationDialog コンポーネントを汎用化して `@nagiyu/ui` に移行し、テストを作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 3

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/testing.md

## 元ファイル
services/tools/src/components/dialogs/MigrationDialog.tsx

## タスク
- [ ] `services/tools/src/components/dialogs/MigrationDialog.tsx` の内容を確認
- [ ] `libs/ui/src/components/dialogs/` ディレクトリ作成
- [ ] `libs/ui/src/components/dialogs/MigrationDialog.tsx` に実装をコピー
- [ ] localStorage を `@nagiyu/browser` の localStorage ラッパーに置き換え
- [ ] サービス固有のメッセージをpropsで受け取るように汎用化
  - `title` prop（デフォルト: "アプリが新しくなりました"）
  - `message` prop（カスタムメッセージ）
  - `storageKey` prop（デフォルト: "migration-dialog-shown"）
- [ ] `libs/ui/src/index.ts` に export を追加
- [ ] `libs/ui/tests/unit/components/dialogs/MigrationDialog.test.tsx` 作成
- [ ] レンダリングテスト（初回訪問）
- [ ] localStorageにフラグがある場合の非表示テスト
- [ ] 「今後表示しない」チェックボックステスト
- [ ] 閉じるボタンのテスト
- [ ] SSR対応のテスト（useEffect内でlocalStorageアクセス）
- [ ] テストカバレッジ80%以上を確認
- [ ] 全テストがパスすることを確認

## 完了基準
- MigrationDialog.tsx が libs/ui に実装されている
- propsで汎用化されている
- localStorage ラッパーを使用している
- 全テストがパス
- テストカバレッジ80%以上

## 備考
- この段階ではToolsサービスからは削除しない（Phase 4で削除）
```

---

### Issue #10: ThemeRegistry コンポーネントの移行とテスト

**タイトル**: `[libs/ui] ThemeRegistry コンポーネントの移行とテスト`

**ラベル**: `type: feature`, `scope: libs`, `priority: high`, `phase: 3`

**説明**:
```markdown
## 概要
Toolsサービスの ThemeRegistry コンポーネントを汎用化して `@nagiyu/ui` に移行し、テストを作成する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 3

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/testing.md

## 元ファイル
services/tools/src/components/ThemeRegistry.tsx

## タスク
- [ ] `services/tools/src/components/ThemeRegistry.tsx` の内容を確認
- [ ] `libs/ui/src/components/ThemeRegistry.tsx` に実装をコピー
- [ ] MigrationDialog の有効/無効を制御可能にする
  - `showMigrationDialog` prop 追加（デフォルト: false）
  - `migrationDialogProps` prop 追加（MigrationDialogに渡すprops）
- [ ] theme を libs/ui からインポート
- [ ] Header, Footer を libs/ui からインポート
- [ ] MigrationDialog を libs/ui からインポート
- [ ] `libs/ui/src/index.ts` に export を追加
- [ ] `libs/ui/tests/unit/components/ThemeRegistry.test.tsx` 作成
- [ ] レンダリングテスト（children表示）
- [ ] MigrationDialog表示/非表示のテスト
- [ ] Header, Footerの組み込みテスト
- [ ] テストカバレッジ80%以上を確認
- [ ] 全テストがパスすることを確認

## 完了基準
- ThemeRegistry.tsx が libs/ui に実装されている
- propsで汎用化されている（MigrationDialog制御）
- 全テストがパス
- テストカバレッジ80%以上

## 備考
- この段階ではToolsサービスからは削除しない（Phase 4で削除）
```

---

## Phase 4: Toolsサービスからの切り出し

### Issue #11: Toolsサービスを共通ライブラリ参照に移行

**タイトル**: `[tools] 共通ライブラリ参照への移行`

**ラベル**: `type: refactor`, `scope: tools`, `priority: high`, `phase: 4`

**説明**:
```markdown
## 概要
Toolsサービスから共通コードを削除し、`@nagiyu/ui`, `@nagiyu/browser`, `@nagiyu/common` を参照するように移行する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 4

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/services/tools/ (Tools サービスドキュメント)

## タスク

### 依存関係の追加
- [ ] `services/tools/package.json` に `@nagiyu/ui`, `@nagiyu/browser`, `@nagiyu/common` を追加
  ```json
  "dependencies": {
    "@nagiyu/ui": "workspace:*",
    "@nagiyu/browser": "workspace:*",
    "@nagiyu/common": "workspace:*"
  }
  ```

### clipboard.ts の移行
- [ ] `services/tools/src/lib/clipboard.ts` を削除
- [ ] インポート文を `@nagiyu/browser` に変更
  - `src/app/transit-converter/page.tsx` など

### localStorage の移行
- [ ] `localStorage` 直接利用を `@nagiyu/browser` のラッパーに変更
  - `src/components/dialogs/MigrationDialog.tsx`
  - `src/app/transit-converter/page.tsx`

### UI コンポーネントの移行
- [ ] `services/tools/src/styles/theme.ts` を削除
- [ ] インポート文を `@nagiyu/ui` に変更
- [ ] `services/tools/src/components/layout/Header.tsx` を削除
- [ ] インポート文を `@nagiyu/ui` に変更、必要に応じてprops追加
- [ ] `services/tools/src/components/layout/Footer.tsx` を削除
- [ ] インポート文を `@nagiyu/ui` に変更
- [ ] `services/tools/src/components/ThemeRegistry.tsx` を削除
- [ ] インポート文を `@nagiyu/ui` に変更、必要に応じてprops追加
- [ ] `services/tools/src/components/dialogs/MigrationDialog.tsx` を削除
- [ ] インポート文を `@nagiyu/ui` に変更、必要に応じてprops追加

### テストの更新
- [ ] ユニットテストのインポート文を更新
- [ ] E2Eテストの動作確認（変更不要のはず）
- [ ] 全ユニットテストがパス（80%以上カバレッジ）
- [ ] 全E2Eテストがパス（3デバイス）

### 動作確認
- [ ] `npm run build` が成功
- [ ] `npm run dev` でローカル起動確認
- [ ] 全機能の動作確認（手動テスト）
- [ ] 開発環境へデプロイして動作確認

## 完了基準
- Toolsサービスから共通コードが完全に削除されている
- 全インポート文が共通ライブラリを参照している
- ビルドが成功
- 全テストがパス（ユニット80%以上、E2E全デバイス）
- 開発環境で正常動作

## 備考
- この作業で初めてToolsサービスから共通コードを削除する
- 慎重にテストを実施し、動作確認を徹底する
```

---

## Phase 5: ドキュメント更新と最終検証

### Issue #12: 共通ライブラリのREADME作成

**タイトル**: `[docs] 共通ライブラリのREADME作成`

**ラベル**: `type: docs`, `scope: libs`, `priority: medium`, `phase: 5`

**説明**:
```markdown
## 概要
各共通ライブラリのREADME.mdを充実させ、使用方法とAPI仕様を明確にする。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 5

## 関連ドキュメント
- docs/development/shared-libraries.md

## タスク

### libs/common/README.md
- [ ] パッケージ概要
- [ ] インストール方法
- [ ] 使用例
- [ ] API仕様（型定義等）
- [ ] 開発ガイド（テスト実行方法等）

### libs/browser/README.md
- [ ] パッケージ概要
- [ ] インストール方法
- [ ] 使用例（clipboard, localStorage）
- [ ] API仕様
  - clipboard.ts の関数仕様
  - localStorage.ts の関数仕様
- [ ] エラーハンドリング説明
- [ ] SSR対応の説明
- [ ] 開発ガイド

### libs/ui/README.md
- [ ] パッケージ概要
- [ ] インストール方法
- [ ] 使用例（各コンポーネント）
- [ ] API仕様
  - Header props
  - Footer props
  - ThemeRegistry props
  - MigrationDialog props
  - theme.ts の説明
- [ ] スタイルカスタマイズ方法
- [ ] 開発ガイド

## 完了基準
- 全ライブラリのREADMEが充実している
- 使用方法が明確
- API仕様が詳細に記載されている
- 新サービス作成時に参照できるレベルの品質

## 備考
- Issue #1, #2, #5 で作成した基本的なREADMEを拡充する作業
```

---

### Issue #13: 開発ドキュメントの更新

**タイトル**: `[docs] 共通ライブラリ関連ドキュメントの更新`

**ラベル**: `type: docs`, `scope: docs`, `priority: medium`, `phase: 5`

**説明**:
```markdown
## 概要
共通ライブラリの実装完了に伴い、関連ドキュメントを最新状態に更新する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 5

## 関連ドキュメント
- docs/development/shared-libraries.md
- docs/development/service-template.md
- README.md

## タスク

### docs/development/shared-libraries.md の更新
- [ ] 実装状況セクションを追加
- [ ] 各ライブラリの実装済み機能を記載
- [ ] 利用方法セクションを拡充（実装例追加）
- [ ] バージョン情報を追加（1.0.0）

### docs/development/service-template.md の更新
- [ ] 共通ライブラリ利用ガイドセクションを追加
- [ ] package.json への依存追加方法
- [ ] 各ライブラリのインポート例
- [ ] 新サービス作成時のチェックリストに共通ライブラリ利用を追加

### README.md の更新
- [ ] libs/ ディレクトリの説明を追加
- [ ] 共通ライブラリの概要説明
- [ ] 各ライブラリへのリンク

### その他
- [ ] 必要に応じて他のドキュメントを更新

## 完了基準
- 全関連ドキュメントが最新状態
- 新サービス作成時に共通ライブラリを即座に利用できる情報が揃っている
- リンク切れがない

## 備考
- ドキュメント駆動開発の一環として、実装完了後のドキュメント同期は必須
```

---

### Issue #14: 最終統合テストと検証

**タイトル**: `[test] 共通ライブラリ抽出の最終統合テストと検証`

**ラベル**: `type: test`, `scope: platform`, `priority: high`, `phase: 5`

**説明**:
```markdown
## 概要
共通ライブラリ抽出プロジェクト全体の最終的な統合テストと検証を実施する。

## 親タスク
tasks/shared-libraries-extraction-roadmap.md - Phase 5

## 関連ドキュメント
- docs/development/testing.md
- docs/development/shared-libraries.md

## タスク

### 共通ライブラリのテスト
- [ ] libs/common のビルド成功
- [ ] libs/common の全テストがパス
- [ ] libs/browser のビルド成功
- [ ] libs/browser の全テストがパス（80%以上カバレッジ）
- [ ] libs/ui のビルド成功
- [ ] libs/ui の全テストがパス（80%以上カバレッジ）

### Toolsサービスのテスト
- [ ] services/tools のビルド成功
- [ ] services/tools の全ユニットテストがパス（80%以上カバレッジ）
- [ ] services/tools の全E2Eテストがパス（3デバイス）
- [ ] 開発環境での動作確認

### CI/CD検証
- [ ] ci-fast が正常動作（integration/** へのPR）
- [ ] ci-full が正常動作（develop へのPR）
- [ ] カバレッジチェックが機能している

### 依存関係検証
- [ ] libs/ui → libs/browser → libs/common の依存関係が正しい
- [ ] 循環依存が存在しない
- [ ] パスエイリアス禁止ルールが守られている（相対パスのみ）

### ドキュメント検証
- [ ] 全READMEが最新
- [ ] リンク切れがない
- [ ] 新サービス作成手順が明確

### タスクファイルの更新
- [ ] tasks/shared-libraries-extraction-roadmap.md の全完了基準をチェック
- [ ] 完了ステータスに更新

## 完了基準
- 全テストがパス
- 全CIワークフローが正常動作
- ドキュメントが最新状態
- 新サービス作成時に共通ライブラリを即座に利用可能
- ロードマップの全完了基準を満たしている

## 備考
- この Issue が完了すれば、共通ライブラリ抽出プロジェクト全体が完了
- バージョン1.0.0としてリリース準備完了
```

---

## Issue作成時の注意事項

### ラベル体系

- **type**: `feature`, `refactor`, `docs`, `test`
- **scope**: `libs`, `tools`, `docs`, `platform`
- **priority**: `high`, `medium`, `low`
- **phase**: `1`, `2`, `3`, `4`, `5`

### 依存関係

以下の順序で Issue を実施すること（前の Issue が完了してから次へ進む）:

1. **Phase 1**: Issue #1
2. **Phase 2**: Issue #2 → Issue #3, #4（並行可）
3. **Phase 3**: Issue #5 → Issue #6, #7, #8, #9, #10（一部並行可）
4. **Phase 4**: Issue #11（Phase 3完了後）
5. **Phase 5**: Issue #12, #13（並行可）→ Issue #14

### GitHub Copilot Agent への指示

各Issueには以下を明記すること:
- **親タスク**: `tasks/shared-libraries-extraction-roadmap.md - Phase X`
- **関連ドキュメント**: 参照すべきドキュメントパス

エージェントは `.github/agents/task.implement.agent.md` に従って実装を進める。

---

## 次のアクション

1. 本ドキュメントのレビュー・承認
2. GitHub MCP を使用して Issue #1 から順次作成
3. 各 Issue を GitHub Copilot Agent で実装
