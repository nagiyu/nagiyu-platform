# Copilot Review - nagiyu-platform カスタムインストラクション

## 重要: レビュー言語の指定

**MUST: すべてのレビューコメントは日本語で記述すること**

- 説明文、指摘事項、提案はすべて日本語で記載
- コードスニペットやエラーメッセージ内の英語はそのまま保持
- 技術用語: TypeScript, Next.js, React などは英語のまま使用可

---

## プロジェクト概要

- **プロジェクト**: Nagiyu Platform（AWS上のモノレポ）
- **技術スタック**: Next.js + TypeScript + Material-UI + Jest + Playwright
- **テスト戦略**: 2段階CI（Fast/Full）、スマホファースト
- **デプロイ**: AWS（CloudFormation/CDK, CloudFront, Lambda, ECR）

### モノレポ構成

```
libs/
├── common/        # 完全フレームワーク非依存（外部依存なし）
├── browser/       # ブラウザAPI依存（Clipboard、localStorage等）
└── ui/            # Next.js + Material-UI 依存

services/          # アプリケーション
```

**依存関係の一方向性**: `ui → browser → common`（循環依存禁止）

---

## コーディング規約

詳細は [docs/development/rules.md](../docs/development/rules.md) を参照してください。

### 特に重要なルール

- **MUST**: TypeScript strict mode 必須
- **MUST**: テストカバレッジ 80%以上必須（Jest の `coverageThreshold` で自動失敗）
- **MUST**: エラーメッセージは日本語 + 定数化（`ERROR_MESSAGES` オブジェクト）
- **MUST**: UI層（`components/`, `app/`）とビジネスロジック（`lib/`）を分離
- **MUST**: ライブラリ依存の一方向性を保つ（`ui → browser → common`）
- **MUST NOT**: ライブラリ内でパスエイリアス (`@/`) を使用しない
- **MUST NOT**: `dangerouslySetInnerHTML` を使用しない（DOMPurify経由のみ）

---

## テスト要件

詳細は [docs/development/testing.md](../docs/development/testing.md) を参照してください。

### 重点項目

- **カバレッジ**: 80%以上必須、ビジネスロジック（`lib/`）を重点的にテスト
- **配置**: テストファイルは `tests/` 配下に集約（`src/` と分離）
- **モック**: 副作用がある処理のみモック化、純粋関数はそのまま実行
- **E2Eデバイス**: Fast CI は `chromium-mobile` のみ、Full CI は全デバイス

---

## PR検証チェックリスト

レビュー時は以下を確認してください：

- [ ] ビルド成功（Next.js / Docker）
- [ ] ユニットテスト合格
- [ ] テストカバレッジ 80%以上（develop以上へのPR）
- [ ] E2Eテスト合格（Fast: chromium-mobile / Full: 全デバイス）
- [ ] ESLint: エラーなし
- [ ] Prettier: フォーマット統一
- [ ] TypeScript strict mode 有効
- [ ] エラーメッセージが日本語 + 定数化されているか
- [ ] ライブラリ依存の一方向性が保たれているか
- [ ] UI層とビジネスロジックが分離されているか
- [ ] テストが `tests/` 配下に配置されているか
- [ ] ドキュメント更新（機能追加時）

---

## レビュー重点項目

1. **最小限のルール原則**: 過剰な抽象化や不要な機能追加を避ける
2. **依存関係の一方向性**: `ui → browser → common` の方向性が保たれているか
3. **エラーハンドリング**: 日本語 + 定数化されているか
4. **テストカバレッジ**: 80%以上、ビジネスロジックが十分にテストされているか
5. **共通ライブラリの活用**: ブラウザAPI使用時に `@nagiyu/browser` が活用されているか

---

## ブランチ戦略とCI/CD

詳細は [docs/branching.md](../docs/branching.md) および [docs/development/testing.md](../docs/development/testing.md) を参照してください。

### ブランチフロー

```
feature/**  →  integration/**  →  develop  →  master
           (Fast CI)      (Full CI)   (本番)
```

### CI要件

- **Fast CI** (integration/** へのPR): ビルド、品質チェック、テスト、E2E（chromium-mobile のみ）
- **Full CI** (develop へのPR): Fast CI + カバレッジチェック（80%未満で失敗）+ E2E（全デバイス）

---

## 参考ドキュメント

- **コーディング規約**: [docs/development/rules.md](../docs/development/rules.md)
- **テスト戦略**: [docs/development/testing.md](../docs/development/testing.md)
- **ブランチ戦略**: [docs/branching.md](../docs/branching.md)
- **アーキテクチャ**: [docs/development/architecture.md](../docs/development/architecture.md)
- **共通ライブラリ**: [docs/development/shared-libraries.md](../docs/development/shared-libraries.md)
