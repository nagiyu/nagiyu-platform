#!/bin/bash
set -euo pipefail

# npm outdated の結果を単一行JSONで出力する。
# 「再実行で得られる情報は載せない」方針により、バージョン比較の詳細ではなく
# 件数と major 更新パッケージ名のみを出力する（詳細は作業時に `npm outdated` を叩けば得られる）。
#
# npm workspaces では依存関係がルートに hoist されるため、ルートの
# `npm outdated` だけで全ワークスペースの依存を含む。そのためワークスペースを
# 1つずつ cd して実行するループは行わない。
#
# 出力契約:
#   {"count":N,"majorCount":N,"majorPackages":[...]}
#   - count: ユニークなパッケージ名の数（npm outdated --json は依存元ごとに
#            同一パッケージを複数回出力しうるため重複を除いてカウントする）
#   - majorCount / majorPackages: current と latest の先頭の数値部分（メジャー
#     バージョン）を比較し、latest の方が大きいパッケージのみを対象とする
#     （latest が current より小さい降格ケースは対象外）
#
# テスト用: 環境変数 NPM_OUTDATED_JSON_FILE に `npm outdated --json` 相当の
# JSONファイルパスを指定すると、実際に npm outdated を実行せずそのファイルを
# 入力として集計する（node_modules が無い環境でも集計ロジックを検証できるようにするため）。

OUTDATED_JSON_FILE="${NPM_OUTDATED_JSON_FILE:-}"

if [ -z "$OUTDATED_JSON_FILE" ]; then
  OUTDATED_JSON_FILE=$(mktemp)
  npm outdated --json > "$OUTDATED_JSON_FILE" 2>/dev/null || true
fi

# npm outdated --json は更新可能なパッケージが無くても `{}` を出力する。
# つまり出力が空なのはコマンド自体が失敗した場合であり、「0 件」とは区別する
# （取得失敗を 0 件として報告すると、本文が「問題なし」に見えてしまうため）。
if [ ! -s "$OUTDATED_JSON_FILE" ]; then
  echo '{"error":true,"count":0,"majorCount":0,"majorPackages":[]}'
  exit 0
fi

if ! RESULT=$(jq -c '
  # npm outdated --json はオブジェクト（値がオブジェクトまたは配列）で返るのが
  # 通常だが、念のため配列トップレベルも扱う。
  def flat:
    if type == "object" then
      to_entries[] |
      if (.value | type) == "array" then
        (.key as $k | .value[] | {name: $k, current: (.current // null), latest: (.latest // null)})
      else
        {name: .key, current: (.value.current // null), latest: (.value.latest // null)}
      end
    elif type == "array" then
      .[] | {name: (.name // .package // null), current: (.current // null), latest: (.latest // null)}
    else
      empty
    end;

  [flat] as $all
  | ($all | map(.name) | unique) as $names
  | ($all
      | map(select(
          (((.current // "") | test("^[0-9]"))) and (((.latest // "") | test("^[0-9]")))
        ))
      | map(select(
          (((.current | capture("^(?<m>[0-9]+)").m) | tonumber) as $c
           | ((.latest | capture("^(?<m>[0-9]+)").m) | tonumber) as $l
           | $l > $c)
        ))
      | map(.name)
      | unique
    ) as $majorNames
  | {count: ($names | length), majorCount: ($majorNames | length), majorPackages: $majorNames}
' "$OUTDATED_JSON_FILE" 2>/dev/null); then
  # 出力が JSON として解釈できない場合も取得失敗として扱う。
  echo '{"error":true,"count":0,"majorCount":0,"majorPackages":[]}'
  exit 0
fi

echo "$RESULT"
