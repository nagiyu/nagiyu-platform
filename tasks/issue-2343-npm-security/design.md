# npm セキュリティ脆弱性対応 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/rules.md に反映し、
    tasks/issue-2343-npm-security/ ディレクトリごと削除します。

    入力: tasks/issue-2343-npm-security/requirements.md
    次に作成するドキュメント: tasks/issue-2343-npm-security/tasks.md
-->

## 脆弱性の概要

### 検出された脆弱性

| パッケージ | 現在バージョン | 脆弱範囲 | 修正バージョン | 深刻度 | CVE/GHSA |
| ---------- | ------------- | -------- | ------------- | ------ | -------- |
| `fast-xml-parser` | 5.5.5（override） | 4.0.0-beta.3 〜 5.5.6 | 5.5.7+ | High | GHSA-jp2q-39xq-3w4g, GHSA-8gc5-j5rx-235r |
| `flatted` | 3.4.1（直接未依存） | ≤3.4.1 | 3.4.2+ | High | GHSA-rf6f-7fwh-wjgh |
| `@aws-sdk/xml-builder` | 3.972.11 | 3.894.0 〜 3.972.14 | fast-xml-parser 修正後に解消 | Moderate | fast-xml-parser に起因 |

### 依存関係チェーン

**fast-xml-parser 系**:

```
package.json (override: fast-xml-parser@5.5.5)
  └── fast-xml-parser@5.5.5  ← 脆弱（5.5.6 以下）
        └── @aws-sdk/xml-builder@3.972.11 が依存
              └── @aws-sdk/core が依存
                    └── @aws-sdk/client-* が依存
```

**flatted 系**:

```
eslint
  └── file-entry-cache
        └── flat-cache
              └── flatted@3.4.1  ← 脆弱（3.4.1 以下）
```

---

## 修正方針

### 方針: npm overrides による強制バージョン固定

直接依存ではないため、`package.json` の `overrides` フィールドを使用して安全なバージョンに強制固定する。
`npm audit fix` コマンドでも同等の効果が得られるが、overrides の明示管理を優先する。

### 変更ファイル

#### `package.json` - overrides 更新

```json
"overrides": {
  "fast-xml-parser": "5.5.8",
  "flatted": "3.4.2",
  "@smithy/types": "^4.13.0"
}
```

- `fast-xml-parser`: `5.5.5` → `5.5.8`（安全な最新版）
- `flatted`: 新規追加 `3.4.2`（安全な最新版）

#### `infra/codec-converter/package.json` - jest バージョン統一

```json
"devDependencies": {
  "jest": "^30.3.0"
}
```

- `^30.2.0` → `^30.3.0`（ルートの `package.json` に合わせる）

---

## コンポーネント設計

### パッケージ責務分担

| 対象ファイル | 変更内容 |
| ----------- | -------- |
| `package.json` | `overrides` の更新（fast-xml-parser, flatted） |
| `package-lock.json` | overrides 更新後に自動再生成 |
| `infra/codec-converter/package.json` | jest バージョン更新 |
| `infra/package-lock.json` | jest 更新後に自動再生成 |

---

## 実装上の注意点

### 依存関係・前提条件

- `npm install` 実行環境は Node.js >=24.0.0（`.nvmrc`、`package.json` の `engines` に準拠）
- overrides は npm v8.3.0+ で利用可能（npm v10 系を使用しているため問題なし）

### セキュリティ考慮事項

- overrides でバージョンを上げることで、既存の動作に影響が出る可能性がある（特に fast-xml-parser はメジャーバージョン内のパッチ更新のため低リスク）
- 修正後は `npm audit --audit-level=high` で HIGH 以上の脆弱性がゼロであることを必ず確認する

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/rules.md` の「Package Management」セクションに以下を追記すること：
      <!-- 間接依存の脆弱性対応は overrides による固定管理を推奨する旨を記載 -->
- [ ] `docs/development/rules.md` に npm overrides の運用ルール（High 以上の脆弱性は overrides で即時対応）を追記すること
