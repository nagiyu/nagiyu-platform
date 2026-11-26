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
  OUTDATED_LIBS - libs/ で実行した check-npm-outdated.sh の出力（Base64エンコード済みJSON）
  AUDIT_LIBS - libs/ で実行した check-npm-audit.sh の出力（Base64エンコード済みJSON）
  DUPLICATES - check-duplicates.sh の出力（Base64エンコード済みJSON）
  INCONSISTENCY - check-version-inconsistency.sh の出力（Base64エンコード済みJSON）
  NEXT_DATE - 次回チェック予定日
  CREATE_TIME - 作成日時
"""

import base64
import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

ERROR_MESSAGES = {
    'DECODE_FAILED': 'Base64のデコードに失敗しました（{name}）: {error}',
    'JSON_PARSE_FAILED': 'JSONの解析に失敗しました（{name}）: {error}',
    'TEMPLATE_NOT_FOUND': 'テンプレートファイルが見つかりません: {path}',
}

TEMPLATE_PATH = '.github/workflows/templates/weekly-npm-body.md'

# チェックの実行自体に失敗した項目の件数セルに入れる表記
FAILED_CELL = '取得失敗'


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


def build_detection_targets_section(
    critical_packages: list,
    high_packages: list,
    major_packages: list,
    libs_critical_packages: list,
    libs_high_packages: list,
    libs_major_packages: list,
) -> str:
    """検出対象セクションを組み立てる。該当が0件の行は省略し、
    すべて0件ならセクションごと省略（空文字を返す）する。
    libs/ はルートとは別の npm プロジェクトなので、行を分ける。"""
    lines = []
    if critical_packages:
        lines.append(f'- **Critical**: {format_package_list(critical_packages)}')
    if high_packages:
        lines.append(f'- **High**: {format_package_list(high_packages)}')
    if major_packages:
        lines.append(f'- **major 更新あり**: {format_package_list(major_packages)}')
    if libs_critical_packages:
        lines.append(f'- **Critical (libs/)**: {format_package_list(libs_critical_packages)}')
    if libs_high_packages:
        lines.append(f'- **High (libs/)**: {format_package_list(libs_high_packages)}')
    if libs_major_packages:
        lines.append(f'- **major 更新あり (libs/)**: {format_package_list(libs_major_packages)}')

    if not lines:
        return ''

    return '\n## 検出対象\n\n' + '\n'.join(lines) + '\n'


def build_outdated_summary(count: int, major_count: int, failed: bool) -> str:
    if failed:
        return FAILED_CELL
    if count == 0:
        return '0'
    return f'{count}（うち major 更新 {major_count}）'


def build_nagiyu_section(packages: list, failed: bool) -> str:
    """`@nagiyu/*` の更新の節を組み立てる。該当が0件ならセクションごと省略する。

    0.x の間はマイナー版を上げる変更が壊れる変更になるため、壊れる更新かを添える。
    取得に失敗したときは、件数を出せないので節を省き、対応方針の行で失敗を伝える。
    """
    if failed or not packages:
        return ''

    lines = []
    for pkg in packages:
        mark = '壊れる更新' if pkg.get('breaking') else '壊れない更新'
        lines.append(f"- `{pkg.get('name')}`: {pkg.get('current')} → {pkg.get('latest')}（{mark}）")

    return '\n## @nagiyu/* の更新\n\n' + '\n'.join(lines) + '\n'


def build_libs_audit_summary(audit: dict, failed: bool) -> str:
    if failed:
        return FAILED_CELL
    return ' / '.join(
        str(audit.get(k, 0)) for k in ('critical', 'high', 'moderate', 'low')
    )


def count_cell(value: int, failed: bool) -> str:
    """取得に失敗したチェックの件数セルは 0 と区別できる表記にする。"""
    return FAILED_CELL if failed else str(value)


def build_policy_line(critical: int, high: int, failed_sources: list) -> str:
    """対応方針の行を組み立てる。

    チェックが失敗しているときに「✅ 検出されていません」と出すと、取得失敗が
    健全な状態と区別できなくなる（サイレント失敗）ため、失敗を明示する。
    """
    lines = []
    if failed_sources:
        lines.append(
            '⚠️ 一部のチェックが実行に失敗しています（'
            + ', '.join(failed_sources)
            + '）。件数は不完全です。CI ログを確認してください。'
        )
    if critical > 0 or high > 0:
        lines.append('⚠️ Critical / High の脆弱性が検出されています。対応を推奨します。')
    elif not failed_sources:
        lines.append('✅ Critical / High の脆弱性は検出されていません。')
    return '\n'.join(lines)


def main():
    audit = decode_json_env('AUDIT', {})
    outdated = decode_json_env('OUTDATED', {})
    duplicates = decode_json_env('DUPLICATES', {})
    inconsistency = decode_json_env('INCONSISTENCY', {})
    outdated_libs = decode_json_env('OUTDATED_LIBS', {})
    audit_libs = decode_json_env('AUDIT_LIBS', {})

    audit_failed = bool(audit.get('error', False))
    outdated_failed = bool(outdated.get('error', False))
    audit_libs_failed = bool(audit_libs.get('error', False))
    outdated_libs_failed = bool(outdated_libs.get('error', False))
    failed_sources = []
    if audit_failed:
        failed_sources.append('npm audit')
    if outdated_failed:
        failed_sources.append('npm outdated')
    if audit_libs_failed:
        failed_sources.append('npm audit (libs/)')
    if outdated_libs_failed:
        failed_sources.append('npm outdated (libs/)')

    # 対応方針の判定は、ルートと libs/ の両方の Critical / High を見る
    critical = audit.get('critical', 0) + audit_libs.get('critical', 0)
    high = audit.get('high', 0) + audit_libs.get('high', 0)
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
        datetime.now(ZoneInfo('Asia/Tokyo')).strftime('%Y-%m-%d %H:%M JST'),
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
    result = result.replace('{{CRITICAL}}', count_cell(audit.get('critical', 0), audit_failed))
    result = result.replace('{{HIGH}}', count_cell(audit.get('high', 0), audit_failed))
    result = result.replace('{{MODERATE}}', count_cell(moderate, audit_failed))
    result = result.replace('{{LOW}}', count_cell(low, audit_failed))
    result = result.replace(
        '{{OUTDATED_SUMMARY}}',
        build_outdated_summary(outdated_count, major_count, outdated_failed),
    )
    result = result.replace(
        '{{LIBS_AUDIT_SUMMARY}}', build_libs_audit_summary(audit_libs, audit_libs_failed)
    )
    result = result.replace(
        '{{LIBS_OUTDATED_SUMMARY}}',
        build_outdated_summary(
            outdated_libs.get('count', 0),
            outdated_libs.get('majorCount', 0),
            outdated_libs_failed,
        ),
    )
    result = result.replace('{{INCONSISTENCY_COUNT}}', str(inconsistency_count))
    result = result.replace('{{DUPLICATES_COUNT}}', str(duplicates_count))
    result = result.replace(
        '{{DETECTION_TARGETS_SECTION}}',
        build_detection_targets_section(
            critical_packages,
            high_packages,
            major_packages,
            audit_libs.get('criticalPackages', []),
            audit_libs.get('highPackages', []),
            outdated_libs.get('majorPackages', []),
        ),
    )
    result = result.replace(
        '{{NAGIYU_SECTION}}',
        build_nagiyu_section(outdated.get('nagiyuPackages', []), outdated_failed),
    )
    result = result.replace('{{POLICY_LINE}}', build_policy_line(critical, high, failed_sources))

    # テンプレート自身の末尾の改行をそのまま保つ
    print(result, end='')


if __name__ == '__main__':
    main()
