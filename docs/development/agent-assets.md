# エージェント資産の住み分け

本リポジトリには AI エージェント向けの資産が複数系統あり、放置すると同じ知識が重複して散らばる。本ドキュメントは「**どの知識をどこに置くか**」の判断基準を 1 枚にまとめる。新しいルール・手順・道具を足すときは、まずここで置き場所を判断する。

---

## レイヤ一覧

| レイヤ | 配置 | いつ効くか | 置くもの |
|---|---|---|---|
| **常時ロード（鉄則）** | `CLAUDE.md` / `AGENTS.md` / `.claude/agents/implementer.md` | 毎ターン（常にコンテキストに載る） | 全作業に効く短い鉄則・ロール定義・MUST NOT |
| **Skill（段階的開示）** | `.claude/skills/<name>/` | 関連したときだけ本文がロードされる（`description` のみ常時） | たまに使う手順・道具（スクリプト / テンプレ同梱可） |
| **サブエージェント** | `.claude/agents/` | spawn 時に別コンテキスト | 物量のある実装を本体の文脈から切り離す（別モデル指定可） |
| **永続ドキュメント** | `docs/` | 必要時に参照 | 「なぜ」（背景・意思決定・設計判断） |
| **Copilot / Codex 用** | `.github/agents/` / `.github/copilot-instructions.md` / `.specify/` | 別ツール側 | Copilot Agent / spec-kit 用の指示。Claude 運用とは別系統 |

---

## 置き場所の判断基準

```
全作業に常に効く短い鉄則か？        → CLAUDE.md / AGENTS.md（常時ロード）
たまに使う手順で、スクリプトやテンプレを同梱したいか？ → Skill
物量のある実装を本体文脈から切り離したいか？        → サブエージェント
「なぜ」を残す永続記録か？                          → docs/
```

### CLAUDE.md（常時ロード）に置くもの

- 言語ルール（出力は日本語）
- MUST NOT（ライブラリ内パスエイリアス禁止、`dangerouslySetInnerHTML` 直接使用禁止 等）
- セッションロール・継ぎ目モデル・integration 判断の根幹
- カバレッジ 80% 等、実装中つねに効くガードレール（実装担当は `implementer.md` 側）

これらは**全ターンに効く**ため、関連時のみロードされる Skill にすると抜け落ちる。常時ロードのままにする。

### Skill に切り出すもの

- env 固有のハマりどころ（shared libs のビルド順序、Playwright 準備など）→ **スクリプトを同梱**し「覚える」を「実行する」に置き換える
- たまにしか使わない長い手順（PR 作成フロー、docs 執筆ルール、tasks/ 提案ドキュメント起こし）→ 関連時のみ展開し、常時ロードを軽くする

判断の目安：**「常時ロードするほどではないが、その都度 Read させると漏れる」もの**が Skill 向き。

### サブエージェントに切り出すもの

- 実装＋テストのように物量があり、本体（オーケストレーター）の文脈を圧迫する作業。別モデル（Sonnet）でコスト最適化する。

---

## Skill の基本構造

```
.claude/skills/<name>/
├── SKILL.md          # frontmatter（name / description）+ 手順本文
└── scripts/          # 同梱スクリプト（任意・参照時のみ読まれる）
```

- `description` は「いつ使うか」が伝わるよう三人称で書く（モデルがこの 1 行で起動を判断する）。
- 本文・同梱スクリプトは関連時のみロードされる（段階的開示）。常時ロードされるのは `description` だけ。
- ユーザーが `/<name>` で明示起動することもできる。

---

## Copilot / Codex 用資産との関係

`.github/agents/`（`docs.write` / `task.proposal` / `task.implement` 等）と `.specify/`（spec-kit）は **Copilot Agent / Codex 用**で、Claude 運用とは別系統。Claude 用に同種の手順が欲しい場合は、これらを消さず `.claude/skills/` に Claude 用 Skill を新規に置く（当面は並存）。

---

## 関連ドキュメント

- [`CLAUDE.md`](../../CLAUDE.md) — Claude 運用ハンドブック（常時ロード）
- [`docs/development/claude-environment.md`](claude-environment.md) — env 固有事情（Skill 化の元ネタ）
- [`.claude/agents/implementer.md`](../../.claude/agents/implementer.md) — 実装サブエージェント定義
