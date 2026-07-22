# リブトーク（LiveTalk）

## 概要

リブトーク（LiveTalk）は、Live2D アバターと AI（LLM + 音声合成）を組み合わせた AI コンパニオン PWA です。ユーザーはキャラクター（桃瀬ひより）とテキストで会話でき、応答はテキスト・音声・Live2D モーションで返ってきます。

他の AI チャットサービスとの差別化は機能数ではなく、**「キャラが同じ時間軸で生活している」体験の総合演出**に置いています。会話の記憶・関係性の育成・時刻ベースの生活サイクル・能動的なプッシュ通知を組み合わせ、「存在感」を提供します。

MVP（Phase 0〜5）が完成しており、描画・音声・AI 統合・記憶・生活サイクル・能動アクションの全要素が実装されています。

---

## ドキュメント一覧

| ドキュメント | 説明 |
| ------------ | ---- |
| [requirements.md](./requirements.md) | ビジネス要件・ユースケース・機能要件・ドメインオブジェクト |
| [external-design.md](./external-design.md) | 画面設計・概念データモデル・設計上の決定事項 |
| [architecture.md](./architecture.md) | アーキテクチャ設計決定記録（ADR） |
| [roadmap.md](./roadmap.md) | Phase 6+ 将来拡張ロードマップ |

---

## クイックスタート

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **画面・データ構造を把握する**: [external-design.md](./external-design.md) を読む
3. **設計の意図を確認する**: [architecture.md](./architecture.md) を読む
4. **将来拡張を確認する**: [roadmap.md](./roadmap.md) を読む
5. **実装を確認する**: ソースコード (`services/livetalk/`) を参照

---

## プロジェクト情報

- **プロジェクト名**: LiveTalk（リブトーク）
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/livetalk/`（core / web / batch）
- **インフラ定義**: `infra/livetalk/`（共通 Cluster は `infra/shared/`）
- **リージョン**: us-east-1（CloudFront 連携のため固定）

---

## アーキテクチャ要点

- **構成**: ECS Fargate 1 Task に Next.js + VOICEVOX の 2 コンテナ同居
- **データ**: DynamoDB Single Table（1 メッセージ 1 item、Message は TTL 90 日）
- **バッチ**: EventBridge Scheduler + Lambda（Topic 集約 / Web 取得 / 通知 / 活動時間学習、各独立）
- **キャラ**: 桃瀬ひより（Live2D 公式サンプル）+ VOICEVOX 冥鳴ひまり（speaker=14）
- **LLM**: OpenAI GPT-4o / GPT-4o-mini（用途別振り分け）、要約・分類は Structured Outputs
- **認可**: 既存 RBAC（`livetalk:chat` / `livetalk:admin`）

詳細は [architecture.md](./architecture.md) を参照。

---

## ライセンス注意事項

UI に常時表示が必要なクレジット（フッター本体）：

- 「VOICEVOX:冥鳴ひまり」
- 「Live2D キャラクター: 桃瀬ひより ©Live2D Inc.」（イラスト原作: かにビーム）

年商 1,000 万円を超える前、または中・大規模事業者扱いになる前に Live2D との別途契約が必要です。詳細は [architecture.md](./architecture.md)「2.10」を参照。

---

## 関連ドキュメント

- [開発フロー](../../development/flow.md)
- [ブランチ戦略](../../branching.md)
- [開発ガイドライン](../../development/rules.md)
- [認証](../../development/authentication.md)
- [PWA](../../development/pwa.md)
- [共通ライブラリ](../../development/shared-libraries.md)
