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

## カードの文面だけを単独で直さない

カードの文面だけを単独で直さず、コードを変える PR の中で、コードを読んで作り直す。手順は docs-write スキルの仕様カードの節 (`.claude/skills/docs-write/spec-cards.md`) にある。

- カードとコードが食い違ったときは、原因で扱いを分ける。カードの読み取り違いなら、コードから作り直す。コードが意図と違うなら、コードを直してからカードを作り直す。

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
| `term` | 用語 |

`api` や `screen` など、種別は必要になったら足す。

## frontmatter

```yaml
---
id: livetalk/batch/acquire        # docs/specs/ からの相対パスから .md を除いたもの
title: 勉強バッチ (acquire)
kind: batch                       # batch | flow | term
service: livetalk
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
| `sources` | 必須 | 元にしたファイル |
| `sources_hash` | 必須 | `sources` から計算した値 |
| `terms` | 任意 | 本文で使う用語カード |
| `related_cards` | 任意 | 併せて読むカード |
| `related_adr` | 任意 | 「なぜ」の参照先。アンカーは見出しの先頭の語 (節番号 `2.24`、`ADR-003` など) |

- 生成日時のような、作り直すたびに変わる値は入れない。差分のノイズになるため。
- `sources_hash` は、`sources` をパスでソートし、各ファイルの「パス + 改行 + 中身」を連結した sha256 である。CRLF は LF にそろえて計算する。

## 本文の型

見出しは種別ごとに固定する。概要・定義は、`#` の見出しの直後に見出しなしで書く。

### batch

この型は livetalk と Admin の少数のカードから作った仮の型で、ほかのサービスへ広げるときに見直す。

必須の節:

1. 概要 (1〜2 文)
2. `## 起点` (スケジュール、または起動のきっかけ。利用者の操作などで 1 件ずつ起動するジョブは、何が起動するかを書く)
3. `## 処理` (フロー図 + 表・箇条書き)
4. `## 失敗したとき`
5. `## つながり` (mermaid)

任意の節 (持っているバッチだけ書く。書くときは、処理の前後で次の位置に置く):

- `## 対象から外れる条件`: `## 起点` の次。対象になる条件 (最低発話数・見る期間など) もここに書く
- `## 上限`: `## 処理` の次。処理を止める仕組みとしての上限 (回数・件数の上限など) だけを書く。処理のパラメータ (候補の上位件数・保持件数・文字数など) は、処理の表・箇条書きに書く

### flow

必須の節 (どの経路にもあるもの):

1. 概要
2. `## 起点`
3. `## 経路` (フロー図またはシーケンス図 + 補足)
4. `## 届く先`

任意の節:

- `## 失敗・取りこぼしのとき`: 失敗や取りこぼしの扱いが決まっているときに書く
- `## つながり` (mermaid): 経路の図が起点・データ・届く先との関係まで描いていて重なるなら、省いてよい

### 図の書き方

- **処理・経路は図にする**。順番、分岐、止まる条件を描く。検索語・時間・期限・上限の値のような細かい条件と数値は、図の下の表・箇条書きに置き、図には詰め込まない
- **つながりは、処理の中身ではなく関係を描く**。起点 (スケジュール、会話など)、読み書きするデータ、ほかのバッチ、Admin との関係である
- 縦向き (`flowchart TD`) にする。横長 (`LR`) はスマホで文字が小さくなりすぎる
- ノードのラベルを「数字 + ピリオド + 空白」で始めない (`1. ...` は Markdown の箇条書きと解釈され、「Unsupported markdown: list」と表示される)。番号を振るなら ①②③ を使う
- 1 枚の図はノード 10 個程度までを目安にする。超えるなら図を分けるか、細部を表に逃がす
- ラベル内の改行は `<br/>`

### term

1. 一言の定義
2. `## 説明` (数行)
3. `## 関連するカード`

廃止した用語のカードは作らない (置き換えの経緯は ADR に、昔の中身は git の履歴にある)。

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
- `terms`・`related_cards` が実在するカードを指す。`related_adr` が実在する節を指す
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

### admin

| id | カード |
|---|---|
| `admin/flow/error-notification` | [エラー通知の経路](./admin/flow/error-notification.md) |

### platform

| id | カード |
|---|---|
| `platform/term/error-event` | [ErrorEvent (エラーイベント)](./platform/term/error-event.md) |
