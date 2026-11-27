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
#   {"count":N,"majorCount":N,"majorPackages":[...],
#    "nagiyuCount":N,"nagiyuBreakingCount":N,
#    "nagiyuPackages":[{"name","current","latest","breaking"}]}
#   - count: `@nagiyu/*` 以外のユニークなパッケージ名の数（npm outdated --json は
#            依存元ごとに同一パッケージを複数回出力しうるため重複を除いてカウントする）
#   - majorCount / majorPackages: `@nagiyu/*` 以外で、current と latest の先頭の
#     数値部分（メジャーバージョン）を比較し、latest の方が大きいパッケージのみを対象とする
#     （latest が current より小さい降格ケースは対象外）
#   - nagiyuPackages: `@nagiyu/*` で latest が current より新しいもの。別の節に出すため
#     count / majorPackages には含めない。範囲 (`^0.1.1`) の外に出た版も拾うため、
#     範囲内の最新を指す wanted ではなく、レジストリの最新を指す latest と比べる。
#     breaking は、メジャー版が違う、または 0.x のときにマイナー版が違う場合に true
#     （0.x の間は、マイナー版を上げる変更が壊れる変更になる）
#
# 環境変数 NPM_WORKDIR に作業ディレクトリを指定すると、そこで npm outdated を実行する
# （libs/ のようにルートとは別の npm プロジェクトを検査するため。既定はカレント）。
#
# テスト用: 環境変数 NPM_OUTDATED_JSON_FILE に `npm outdated --json` 相当の
# JSONファイルパスを指定すると、実際に npm outdated を実行せずそのファイルを
# 入力として集計する（node_modules が無い環境でも集計ロジックを検証できるようにするため）。

OUTDATED_JSON_FILE="${NPM_OUTDATED_JSON_FILE:-}"

ERROR_RESULT='{"error":true,"count":0,"majorCount":0,"majorPackages":[],"nagiyuCount":0,"nagiyuBreakingCount":0,"nagiyuPackages":[]}'

if [ -z "$OUTDATED_JSON_FILE" ]; then
  OUTDATED_JSON_FILE=$(mktemp)
  # 作業ディレクトリに入れない場合も取得失敗として扱う（空ファイルのまま下へ進む）
  (cd "${NPM_WORKDIR:-.}" && npm outdated --json) > "$OUTDATED_JSON_FILE" 2>/dev/null || true
fi

# npm outdated --json は更新可能なパッケージが無くても `{}` を出力する。
# つまり出力が空なのはコマンド自体が失敗した場合であり、「0 件」とは区別する
# （取得失敗を 0 件として報告すると、本文が「問題なし」に見えてしまうため）。
if [ ! -s "$OUTDATED_JSON_FILE" ]; then
  echo "$ERROR_RESULT"
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

  def ver: capture("^(?<a>[0-9]+)\\.?(?<b>[0-9]*)\\.?(?<c>[0-9]*)") | [.a, .b, .c] | map(if . == "" then 0 else tonumber end);
  def isnum: (. // "") | test("^[0-9]");

  [flat] as $everything
  | ($everything | map(select((.name // "") | startswith("@nagiyu/") | not))) as $all
  | ($everything
      | map(select((.name // "") | startswith("@nagiyu/")))
      | map(select((.current | isnum) and (.latest | isnum)))
      | map((.current | ver) as $c | (.latest | ver) as $l
            | select($l > $c)
            | {name, current, latest,
               breaking: (($l[0] != $c[0]) or ($c[0] == 0 and $l[1] != $c[1]))})
      | unique_by([.name, .current, .latest])
    ) as $nagiyu
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
  | {count: ($names | length), majorCount: ($majorNames | length), majorPackages: $majorNames,
     nagiyuCount: ($nagiyu | length),
     nagiyuBreakingCount: ($nagiyu | map(select(.breaking)) | length),
     nagiyuPackages: $nagiyu}
' "$OUTDATED_JSON_FILE" 2>/dev/null); then
  # 出力が JSON として解釈できない場合も取得失敗として扱う。
  echo "$ERROR_RESULT"
  exit 0
fi

echo "$RESULT"
