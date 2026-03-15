# Tools のコンテンツを見直す

## 概要

Tools サイト（`nagiyu.com`）が Google AdSense の「有用性の低いコンテンツ」審査で落ちた。
広告収益による運用コスト補填を実現するため、サイトの構成とコンテンツを改善して再審査を通過させる。

## 関連情報

- Issue: #2132
- タスクタイプ: サービスタスク（tools）
- 対象: `services/tools/`

---

## 現状の課題

### Google AdSense「有用性の低いコンテンツ」判定の一般的原因

- 独自性の低いコンテンツ、または内容が薄い
- フォームやツールのみでテキストコンテンツが不足している
- サポートするコンテンツ（説明・ガイド）が不十分
- ページ数・コンテンツ量が少ない

### 現状の Tools サイト

1. **提供ツールが少ない**
    - 乗り換え変換ツール（transit-converter）
    - JSON 整形ツール（json-formatter）

2. **コンテンツの不整合**
    - `about` ページの「今後の展望」セクションに JSON フォーマッターが「今後追加する予定」として記載されているが、すでに実装済み
    - 実際に提供中のツールの説明が不十分

3. **各ツールページのコンテンツ**
    - transit-converter: 使い方ガイドは充実しているが、ユースケース説明が不足
    - json-formatter: description が「JSONの整形・圧縮・検証ができます」のみで薄い

4. **構造化データ**
    - schema.org マークアップが未実装

---

## 要件

### 機能要件

- FR1: `about` ページのコンテンツを実態に合わせて更新する（JSON フォーマッターを「提供中」に移動、「今後の展望」を更新）
- FR2: 各ツールページに十分なテキストコンテンツ（説明・ユースケース・FAQ）を追加する
- FR3: ホームページのコンテンツを充実させ、各ツールの価値を明確に伝える
- FR4: 新規ツールを追加することでサイトの有用性を高める（VAPID キー生成・Base64・URL エンコード・ハッシュ生成・タイムスタンプ変換の 5 本、優先度: 中）
- FR5: 各ページに適切な schema.org 構造化データを追加する

### 非機能要件

- NFR1: 既存のテストがすべて引き続きパスすること
- NFR2: テストカバレッジ 80%以上を維持すること
- NFR3: Lighthouse スコアに影響を与えないこと（SEO・アクセシビリティの維持）
- NFR4: TypeScript strict mode を維持すること

---

## 実装のヒント

### コンテンツ改善の方向性

Google AdSense の「有用性の高いコンテンツ」基準を満たすには以下が重要:

1. **各ページに十分なオリジナルテキストコンテンツを持たせる**
    - ツールの説明、使い方、注意点、ユースケースなど
    - 単なるフォーム UI だけでなく、テキストで補足する

2. **サイト全体のコンテンツ量と質を高める**
    - `about` ページ: 実態に合わせた正確な情報
    - 各ツールページ: 詳細な説明とユースケース紹介
    - ホームページ: 各ツールの価値説明を強化

3. **一貫性のある情報を提供する**
    - 実装済みのツールを「今後の展望」に残さない
    - メタデータ（description）も充実させる

### 新規ツール候補（全て追加）

以下の 5 本を全て追加する。クライアントサイドでの実装を基本とするが、実装が複雑になる場合は API Route（`/api/`）を経由する形でもよい:

1. **VAPID キー生成ツール**（`vapid-generator`）
    - Web Push 通知実装時に必要な公開鍵/秘密鍵ペアを生成
    - 公開鍵・秘密鍵を Base64url 形式で出力
    - API Route 経由（Node.js `crypto` モジュールの `generateKeyPair`）での実装を推奨
2. **Base64 エンコーダー/デコーダー**（`base64`）
    - テキストの Base64 変換
    - クライアントサイド（`btoa`/`atob`）またはシンプルな API Route 経由のいずれか簡単な方で実装
3. **URL エンコーダー/デコーダー**（`url-encoder`）
    - パーセントエンコーディングの変換
    - クライアントサイド（`encodeURIComponent`/`decodeURIComponent`）またはシンプルな API Route 経由のいずれか簡単な方で実装
4. **ハッシュ生成ツール**（`hash-generator`）
    - SHA-256 / SHA-512 のハッシュ値を Hex 形式で生成（出力はシンプルに Hex のみ）
    - クライアントサイド（Web Crypto API）またはシンプルな API Route 経由のいずれか簡単な方で実装
5. **タイムスタンプ変換ツール**（`timestamp-converter`）
    - Unix タイムスタンプ（秒/ミリ秒）と日時文字列の相互変換
    - Stock Tracker のタイムスタンプ処理を参考に実装（コードの重複は許容、`@nagiyu/stock-tracker-*` の Import は禁止）

### 構造化データ（schema.org）

各ページに適したマークアップを追加:

- トップページ: `WebSite`, `SoftwareApplication`
- ツールページ: `WebApplication`（各ツールごと）

---

## タスク

### Phase 1: コンテンツ修正（高優先度）

- [x] T001: `about` ページの「提供ツール」セクションに JSON フォーマッターを追加
- [x] T002: `about` ページの「今後の展望」セクションから JSON フォーマッターを削除し、残りの予定ツールを更新
- [x] T003: `json-formatter` ページの description（metadata）を詳細なものに改善
- [x] T004: `json-formatter` ページに使い方ガイドセクションを追加（transit-converter 相当の充実度に）
- [x] T005: ホームページの各ツールカード説明文を充実させる
- [x] T006: ホームページのサイト説明テキストを見直し、有用性を明確化する

### Phase 2: 構造化データの追加（中優先度）

- [x] T007: トップページに `WebSite` / `SoftwareApplication` の schema.org JSON-LD を追加
- [x] T008: 各ツールページ（transit-converter, json-formatter）に `WebApplication` schema.org JSON-LD を追加

### Phase 3: 新規ツール追加（中優先度）

各ツールの実装パターン: `services/tools/src/app/{tool-slug}/page.tsx` + ロジックは `lib/` 配下に分離

#### T009: VAPID キー生成ツール（`vapid-generator`）

- [x] T009-1: `app/api/vapid/route.ts` に Node.js `crypto` モジュール（`generateKeyPair`）を使ったキー生成 API を実装
- [x] T009-2: `lib/vapid.ts` に API 呼び出しロジックを実装
- [x] T009-3: `app/vapid-generator/page.tsx` に UI 実装（公開鍵/秘密鍵をそれぞれコピー可能な形で表示）
- [x] T009-4: ホームページのツール一覧に追加

#### T010: Base64 エンコーダー/デコーダー（`base64`）

- [x] T010-1: `lib/base64.ts` にエンコード/デコードロジックを実装（クライアントサイドまたは API Route 経由）
- [x] T010-2: `app/base64/page.tsx` に UI 実装（入力/出力エリア、エンコード/デコード切り替え）
- [x] T010-3: ホームページのツール一覧に追加

#### T011: URL エンコーダー/デコーダー（`url-encoder`）

- [x] T011-1: `lib/url-encoder.ts` に変換ロジックを実装（クライアントサイドまたは API Route 経由）
- [x] T011-2: `app/url-encoder/page.tsx` に UI 実装（入力/出力エリア、エンコード/デコード切り替え）
- [x] T011-3: ホームページのツール一覧に追加

#### T012: ハッシュ生成ツール（`hash-generator`）

- [x] T012-1: `lib/hash.ts` に SHA-256/SHA-512 の Hex 出力ロジックを実装（クライアントサイドまたは API Route 経由）
- [x] T012-2: `app/hash-generator/page.tsx` に UI 実装（アルゴリズム選択、Hex 形式で出力）
- [x] T012-3: ホームページのツール一覧に追加

#### T013: タイムスタンプ変換ツール（`timestamp-converter`）

- [x] T013-1: `lib/timestamp.ts` に Unix タイムスタンプ（秒/ミリ秒）と日時文字列の相互変換ロジックを実装（Stock Tracker の実装を参考に、`@nagiyu/stock-tracker-*` の Import は禁止・コード重複は許容）
- [x] T013-2: `app/timestamp-converter/page.tsx` に UI 実装（秒/ミリ秒の入力と日時への変換、Stock Tracker でサポート済みのフォーマット・タイムゾーンに準拠）
- [x] T013-3: ホームページのツール一覧に追加

#### T014: about ページの一括更新

- [x] T014-1: `about` ページの「提供ツール」セクションに全新規ツールを追加
- [x] T014-2: `about` ページの「今後の展望」セクションを削除

#### T015: schema.org JSON-LD（新規ツール分）

- [x] T015-1: 全新規ツールページに `WebApplication` schema.org JSON-LD を追加

### Phase 4: テスト・検証

- [ ] T016: 修正後のコンテンツをレビューし、AdSense 審査基準との整合を確認
- [ ] T017: 既存テストがすべてパスすることを確認
- [ ] T018: 新規ツール（5 本）のユニットテスト実装（各ツール lib/ のカバレッジ 80%以上）
- [ ] T019: E2E テストに新規ツールのシナリオを追加（各ツール最低 1 シナリオ）

---

## 参考ドキュメント

- [docs/services/tools/requirements.md](../docs/services/tools/requirements.md) - Tools ビジネス要件
- [docs/services/tools/tools-catalog.md](../docs/services/tools/tools-catalog.md) - 実装済みツール一覧
- [docs/development/rules.md](../docs/development/rules.md) - コーディング規約
- [docs/development/testing.md](../docs/development/testing.md) - テスト戦略

---

## 備考・未決定事項

### 実装前に決めること

1. **タイムスタンプ変換ツールの仕様**
    - 表示するタイムゾーンの範囲（UTC と JST のみ？ or 全タイムゾーン選択可能？）
    - Stock Tracker でサポート済みのフォーマット・タイムゾーンの確認

2. **URL スラグの命名**
    - 上記のスラグ案（`vapid-generator`, `base64`, `url-encoder`, `hash-generator`, `timestamp-converter`）を使用するか確認

### 決定済み方針

- **about ページの「今後の展望」セクション**: 削除する（T014-2）
- **ハッシュ生成ツールの出力形式**: Hex のみ（シンプルさ優先）
- **各ツールの実装場所**: クライアントサイドを基本とするが、API Route 経由も可
    - VAPID キー生成: API Route 経由（Node.js `crypto` モジュール）推奨
    - その他: クライアントサイドで実装が困難な場合は API Route 経由でも可
- **タイムスタンプ変換**: Stock Tracker の実装を参考にする。コード重複は許容するが `@nagiyu/stock-tracker-*` の Import は禁止

### 進め方

- Phase 1・2 完了後に AdSense 再申請し、結果を見てから Phase 3 に進む方針（コンテンツ改善のみで通過できる可能性）
- Phase 3 は 5 本一括でなく、ツールごとに PR を分けることを推奨（レビュー負荷の分散）
- Google AdSense の再申請タイミングは実装完了後に判断する
