'use client';

import { Table, TableBody, TableCell, TableContainer, TableRow } from '@mui/material';
import Link from '../Link';
import { commercialTransactionItems } from '../../data/commercialTransactionsData';
import type { CommercialTransactionItem } from '../../types/legal';

export interface CommercialTransactionsTableProps {
  /**
   * 料金ページ (プランのページ) へのリンク先。
   * 他のサービスから表示するとき絶対 URL を渡せるよう、部品の外から受け取る
   */
  plansHref: string;
}

/** 項目の内容を、リンクの指定に従って描画する */
function renderValue(item: CommercialTransactionItem, plansHref: string) {
  if (item.linkKind === 'mailto') {
    return <Link href={`mailto:${item.value}`}>{item.value}</Link>;
  }
  if (item.linkKind === 'plans' && item.linkText) {
    const [before, ...rest] = item.value.split(item.linkText);
    return (
      <>
        {before}
        <Link href={plansHref}>{item.linkText}</Link>
        {rest.join(item.linkText)}
      </>
    );
  }
  return item.value;
}

/**
 * 特定商取引法に基づく表記を「項目名 / 内容」の表で描画する。
 * 項目名を行見出し (th scope="row") にし、スクリーンリーダーが内容と対応づけて読めるようにする。
 */
export default function CommercialTransactionsTable({
  plansHref,
}: CommercialTransactionsTableProps) {
  return (
    <TableContainer>
      <Table>
        <TableBody>
          {commercialTransactionItems.map((item) => (
            <TableRow
              key={item.label}
              sx={{
                // モバイル幅では項目名と内容を縦に積み、狭い画面で内容の列が潰れないようにする
                display: { xs: 'block', sm: 'table-row' },
              }}
            >
              <TableCell
                component="th"
                scope="row"
                sx={{
                  display: { xs: 'block', sm: 'table-cell' },
                  width: { sm: '30%' },
                  fontWeight: 600,
                  // 内容が複数行になっても、項目名を内容の 1 行目に揃える
                  verticalAlign: 'top',
                  borderBottom: { xs: 'none', sm: undefined },
                  pb: { xs: 0, sm: undefined },
                }}
              >
                {item.label}
              </TableCell>
              <TableCell
                sx={{
                  display: { xs: 'block', sm: 'table-cell' },
                  verticalAlign: 'top',
                  // 長い本文や URL がはみ出さないよう折り返す
                  overflowWrap: 'anywhere',
                }}
              >
                {renderValue(item, plansHref)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
