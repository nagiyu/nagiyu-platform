# 仕様カード

仕様カードは、**今のコードがどう動くか**を 1 枚 1 テーマでまとめた短い文書である。コードを読む前に挙動をつかみ、コードを読んだ後に取り違えがないかを確かめるために使う。

カードは**コードの写しで、正本ではない**。ADR を積み上げた docs では「今どう動くか」が複数の節に散らばるため、そこを 1 か所に集める役割を持たせた。

## 読み分け

| 知りたいこと | 読むもの |
|---|---|
| 今どう動くか | 仕様カード (この文書の配下) |
| なぜそうしたか・他の案を捨てた理由 | ADR・設計ドキュメント (`docs/services/` など) |
| 本当の挙動 (食い違ったときの正解) | コード |

- カードと ADR が食い違うときは、カードの `sources` に挙げたコードを読んで確かめる。コードが正しい。
- カードには経緯を書かない。経緯は `related_adr` で ADR に任せる。

## カードは手で直さない

カードは人が編集せず、コードを変える PR の中で Claude が作り直す。手順は [spec-card スキル](../../.claude/skills/spec-card/SKILL.md) にある。

- CI は、`sources` に挙げたファイルの中身のハッシュ (`sources_hash`) がカードの値と一致するかだけを確かめる。ずれたカードは、本文が今のコードと合っているかを確かめてから作り直す。
- ハッシュだけを更新して通すと、カードが嘘をつく。本文を確かめずに更新しない。
- `sources` はそのカードの挙動を決めるファイルに絞る。多くのカードが挙げる共有ファイルが変わると、関係ないカードまで確認が要る。

## 配置

```
docs/specs/{service}/{kind}/{name}.md
```

- `service`: サービスのディレクトリ名 (`livetalk`、`admin`)。どのサービスにも属さないものは `platform`
- `kind`: 下の表のいずれか
- `name`: ハンドラ名・用語など、探すときの名前

| kind | 何を書くか |
|---|---|
| `batch` | 定期実行されるバッチ |
| `flow` | 通知経路など、サービスをまたぐ流れ |
| `term` | 用語 (廃止した用語も残す) |

`api` や `screen` など、種別は必要になったら足す。

## frontmatter

```yaml
---
id: livetalk/batch/acquire        # docs/specs/ からの相対パスから .md を除いたもの
title: 勉強バッチ (acquire)
kind: batch                       # batch | flow | term
service: livetalk
status: active                    # term のみ。active | deprecated
replaced_by: [livetalk/term/topic] # term で deprecated のときのみ
sources:                          # 元にしたファイル。リポジトリルートからのパスで、ファイルだけ (glob は不可)
  - services/livetalk/batch/src/handlers/acquire.ts
sources_hash: <sha256>            # スクリプトが計算して書く。手で書かない
terms: [livetalk/term/care]       # 本文で使う用語カードの id
related_cards: [admin/flow/error-notification]
related_adr:                      # docs/ からの相対パス + アンカー
  - services/livetalk/architecture.md#2.25
---
```

| 項目 | 必須 | 内容 |
|---|---|---|
| `id` | 必須 | ファイルの位置と一致させる |
| `title` | 必須 | 見出しにも使う名前 |
| `kind` | 必須 | ディレクトリの `kind` と一致させる |
| `service` | 必須 | ディレクトリの `service` と一致させる |
| `sources` | 必須 | 元にしたファイル。空配列 (`[]`) は、コードが残っていない廃止用語だけに使う |
| `sources_hash` | 必須 | `sources` から計算した値 |
| `status` | term のみ | `active` または `deprecated` |
| `replaced_by` | deprecated の term のみ | 置き換え先のカード |
| `terms` | 任意 | 本文で使う用語カード |
| `related_cards` | 任意 | 併せて読むカード |
| `related_adr` | 任意 | 「なぜ」の参照先。アンカーは見出しの先頭の語 (節番号 `2.24`、`ADR-003` など) |

- 生成日時のような、作り直すたびに変わる値は入れない。差分のノイズになるため。
- `sources_hash` は、`sources` をパスでソートし、各ファイルの「パス + 改行 + 中身」を連結した sha256 である。CRLF は LF にそろえて計算する。

## 本文の型

見出しは種別ごとに固定する。概要・定義は、`#` の見出しの直後に見出しなしで書く。

### batch

1. 概要 (1〜2 文)
2. `## いつ動くか`
3. `## 対象から外れる条件`
4. `## 処理`
5. `## 上限`
6. `## 失敗したとき`
7. `## 図` (mermaid)

### flow

1. 概要
2. `## 起点`
3. `## 経路` (順に)
4. `## 届く先`
5. `## 失敗・取りこぼしのとき`
6. `## 図` (mermaid)

### term

1. 一言の定義
2. `## 説明` (数行)
3. `## 関連するカード`

廃止した用語は `status: deprecated` にして、何に置き換わったかを説明に書く。

## 書き方

- 今の挙動だけを書く。表と箇条書きを中心にし、短くする。
- 数値は定数の値を書く。定数名は、コードと突き合わせる必要があるときだけ書く。
- 表記は [表記規約](../development/writing-style.md) に従う。

## ツール

```bash
node .github/workflows/scripts/spec-cards.mjs update [card...]   # sources_hash を計算して書き戻す (card は id かパス。省略で全カード)
node .github/workflows/scripts/spec-cards.mjs check              # 整合を確かめる (ずれがあれば exit 1)
```

`check` は次を確かめる。

- 必須項目がある。`id` が位置と一致する。`kind` と `service` がディレクトリと一致する
- `sources` のファイルが存在する。`sources_hash` が今のコードと一致する
- `terms`・`related_cards`・`replaced_by` が実在するカードを指す。`related_adr` が実在する節を指す
- すべてのカードが下の索引に載っている

## カード一覧

### livetalk

| id | カード |
|---|---|
| `livetalk/batch/acquire` | [勉強バッチ (acquire)](./livetalk/batch/acquire.md) |
| `livetalk/batch/notify` | [通知バッチ (notify)](./livetalk/batch/notify.md) |
| `livetalk/batch/consolidate-conversations` | [集約バッチ (consolidate)](./livetalk/batch/consolidate-conversations.md) |
| `livetalk/batch/learn-user-activity` | [活動時間学習バッチ (learn-user-activity)](./livetalk/batch/learn-user-activity.md) |
| `livetalk/term/care` | [care (話題への注目度)](./livetalk/term/care.md) |
| `livetalk/term/topic` | [Topic (話題)](./livetalk/term/topic.md) |
| `livetalk/term/self-fact` | [SELF fact](./livetalk/term/self-fact.md) |
| `livetalk/term/web-fact` | [WEB fact](./livetalk/term/web-fact.md) |
| `livetalk/term/webraw` | [WebRaw (Web 取得の生データ)](./livetalk/term/webraw.md) |
| `livetalk/term/lifecycle` | [lifecycle (生活サイクル)](./livetalk/term/lifecycle.md) |
| `livetalk/term/user-activity-profile` | [活動時間プロファイル](./livetalk/term/user-activity-profile.md) |
| `livetalk/term/study-pause` | [勉強の停止 (3 日ルール)](./livetalk/term/study-pause.md) |
| `livetalk/term/study-topic` | [勉強の依頼 (StudyTopic)](./livetalk/term/study-topic.md) |
| `livetalk/term/freshness-check-request` | [鮮度確認の依頼](./livetalk/term/freshness-check-request.md) |
| `livetalk/term/exploration` | [探索の記録](./livetalk/term/exploration.md) |
| `livetalk/term/note` | [ノート](./livetalk/term/note.md) |
| `livetalk/term/memory-tier` | [Memory Tier (廃止)](./livetalk/term/memory-tier.md) |
| `livetalk/term/interest-category` | [InterestCategory (廃止)](./livetalk/term/interest-category.md) |
| `livetalk/term/knowledge` | [Knowledge (廃止)](./livetalk/term/knowledge.md) |

### admin

| id | カード |
|---|---|
| `admin/flow/error-notification` | [エラー通知の経路](./admin/flow/error-notification.md) |

### platform

| id | カード |
|---|---|
| `platform/term/error-event` | [ErrorEvent (エラーイベント)](./platform/term/error-event.md) |
