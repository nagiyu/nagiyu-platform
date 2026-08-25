#!/usr/bin/env python3
"""
週次npm管理レポート Issue の本文を生成するスクリプト

各チェックスクリプト（check-npm-audit.sh / check-npm-outdated.sh /
check-duplicates.sh / check-version-inconsistency.sh）は「再実行で得られる
情報は載せない」方針のもと、markdown ではなく単一行JSON（事実のみ）を出力する。
本スクリプトはそれらをBase64デコード・JSONパースしたうえでテンプレートに
埋め込み、本文レイアウトを一元管理する。

環境変数:
  OUTDATED - check-npm-outdated.sh の出力（Base64エンコード済みJSON）
  AUDIT - check-npm-audit.sh の出力（Base64エンコード済みJSON）
  DUPLICATES - check-duplicates.sh の出力（Base64エンコード済みJSON）
  INCONSISTENCY - check-version-inconsistency.sh の出力（Base64エンコード済みJSON）
  NEXT_DATE - 次回チェック予定日
  CREATE_TIME - 作成日時
"""

import base64
import json
import os
import sys
from datetime import datetime, timezone

ERROR_MESSAGES = {
    'DECODE_FAILED': 'Base64のデコードに失敗しました（{name}）: {error}',
    'JSON_PARSE_FAILED': 'JSONの解析に失敗しました（{name}）: {error}',
    'TEMPLATE_NOT_FOUND': 'テンプレートファイルが見つかりません: {path}',
}

TEMPLATE_PATH = '.github/workflows/templates/weekly-npm-body.md'


def decode_json_env(name: str, default: dict) -> dict:
    """環境変数からBase64エンコードされたJSONを取得してデコードする。"""
    encoded = os.environ.get(name, '')
    if not encoded:
        return default

    try:
        raw = base64.b64decode(encoded).decode('utf-8').strip()
    except Exception as e:
        print(ERROR_MESSAGES['DECODE_FAILED'].format(name=name, error=e), file=sys.stderr)
        sys.exit(1)

    if not raw:
        return default

    try:
        return json.loads(raw)
    except Exception as e:
        print(ERROR_MESSAGES['JSON_PARSE_FAILED'].format(name=name, error=e), file=sys.stderr)
        sys.exit(1)


def format_package_list(packages: list) -> str:
    return ', '.join(f'`{p}`' for p in packages)


def build_detection_targets_section(critical_packages: list, high_packages: list, major_packages: list) -> str:
    """検出対象セクションを組み立てる。該当が0件の行は省略し、
    3種すべて0件ならセクションごと省略（空文字を返す）する。"""
    lines = []
    if critical_packages:
        lines.append(f'- **Critical**: {format_package_list(critical_packages)}')
    if high_packages:
        lines.append(f'- **High**: {format_package_list(high_packages)}')
    if major_packages:
        lines.append(f'- **major 更新あり**: {format_package_list(major_packages)}')

    if not lines:
        return ''

    return '\n## 検出対象\n\n' + '\n'.join(lines) + '\n'


def build_outdated_summary(count: int, major_count: int) -> str:
    if count == 0:
        return '0'
    return f'{count}（うち major 更新 {major_count}）'


def build_policy_line(critical: int, high: int) -> str:
    if critical > 0 or high > 0:
        return '⚠️ Critical / High の脆弱性が検出されています。対応を推奨します。'
    return '✅ Critical / High の脆弱性は検出されていません。'


def main():
    audit = decode_json_env('AUDIT', {})
    outdated = decode_json_env('OUTDATED', {})
    duplicates = decode_json_env('DUPLICATES', {})
    inconsistency = decode_json_env('INCONSISTENCY', {})

    critical = audit.get('critical', 0)
    high = audit.get('high', 0)
    moderate = audit.get('moderate', 0)
    low = audit.get('low', 0)
    critical_packages = audit.get('criticalPackages', [])
    high_packages = audit.get('highPackages', [])

    outdated_count = outdated.get('count', 0)
    major_count = outdated.get('majorCount', 0)
    major_packages = outdated.get('majorPackages', [])

    duplicates_count = duplicates.get('count', 0)
    inconsistency_count = inconsistency.get('count', 0)

    next_date = os.environ.get('NEXT_DATE', '未定')
    create_time = os.environ.get(
        'CREATE_TIME',
        datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    )

    try:
        with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
            template = f.read()
    except FileNotFoundError:
        print(ERROR_MESSAGES['TEMPLATE_NOT_FOUND'].format(path=TEMPLATE_PATH), file=sys.stderr)
        sys.exit(1)

    result = template
    result = result.replace('{{CREATE_TIME}}', create_time)
    result = result.replace('{{NEXT_DATE}}', next_date)
    result = result.replace('{{CRITICAL}}', str(critical))
    result = result.replace('{{HIGH}}', str(high))
    result = result.replace('{{MODERATE}}', str(moderate))
    result = result.replace('{{LOW}}', str(low))
    result = result.replace('{{OUTDATED_SUMMARY}}', build_outdated_summary(outdated_count, major_count))
    result = result.replace('{{INCONSISTENCY_COUNT}}', str(inconsistency_count))
    result = result.replace('{{DUPLICATES_COUNT}}', str(duplicates_count))
    result = result.replace(
        '{{DETECTION_TARGETS_SECTION}}',
        build_detection_targets_section(critical_packages, high_packages, major_packages),
    )
    result = result.replace('{{POLICY_LINE}}', build_policy_line(critical, high))

    # 末尾の改行なしで出力（workflow側でbase64エンコードするため）
    print(result, end='')


if __name__ == '__main__':
    main()
