'use client';

import { useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Button, Chip } from '@nagiyu/ui';
import { Close as CloseIcon } from '@mui/icons-material';
import AlertSettingsModal from './AlertSettingsModal';
import StockChart from './StockChart';
import type { PatternDetail, TickerSummary } from '@/types/stock';
import type { AlertMode } from '@/types/alert';
import { ERROR_MESSAGES } from '@/lib/error-messages';

interface SummaryDetailDialogProps {
  open: boolean;
  summary: TickerSummary | null;
  onClose: () => void;
  onAlertChanged?: () => Promise<void>;
}

const INVESTMENT_SIGNAL_LABELS = {
  BULLISH: '強気',
  NEUTRAL: '中立',
  BEARISH: '弱気',
} as const;
const UI_ERROR_MESSAGES = {
  INSUFFICIENT_DATA_REASON: 'データ不足',
} as const;

const extractExchangeId = (tickerId: string): string => {
  const [exchangeId, symbol] = tickerId.split(':');
  return exchangeId && symbol ? exchangeId : '';
};

const resolveAiAnalysisFallbackMessage = (summary: TickerSummary): string => {
  if (summary.aiAnalysisResult) {
    return '';
  }
  if (typeof summary.aiAnalysisError === 'string') {
    return ERROR_MESSAGES.AI_ANALYSIS_FAILED;
  }

  return ERROR_MESSAGES.AI_ANALYSIS_NOT_GENERATED;
};

export default function SummaryDetailDialog({
  open,
  summary,
  onClose,
  onAlertChanged,
}: SummaryDetailDialogProps) {
  const [alertModalState, setAlertModalState] = useState<{
    open: boolean;
    tradeMode: AlertMode;
    initialPrice: number;
  }>({ open: false, tradeMode: 'Buy', initialPrice: 0 });
  const [chipMenuAnchor, setChipMenuAnchor] = useState<{
    element: HTMLElement;
    price: number;
  } | null>(null);

  const handleClose = () => {
    setAlertModalState((s) => ({ ...s, open: false }));
    setChipMenuAnchor(null);
    onClose();
  };

  const openAlertModal = (tradeMode: AlertMode, initialPrice: number) => {
    setChipMenuAnchor(null);
    setAlertModalState({ open: true, tradeMode, initialPrice });
  };

  const buyPatternDetails: PatternDetail[] = (summary?.patternDetails ?? []).filter(
    (pattern) => pattern.signalType === 'BUY'
  );
  const sellPatternDetails: PatternDetail[] = (summary?.patternDetails ?? []).filter(
    (pattern) => pattern.signalType === 'SELL'
  );
  const selectedTickerExchangeId = summary ? extractExchangeId(summary.tickerId) : '';

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: (theme) => ({
              maxWidth: '100vw',
              width: { xs: `calc(100vw - ${theme.spacing(2)})`, sm: '100%' },
              overflow: 'hidden',
            }),
          },
        }}
      >
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          {summary?.symbol}
          <IconButton onClick={handleClose} size="small" aria-label="閉じる">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ overflowX: 'hidden' }}>
          {summary && (
            <Box sx={{ display: 'grid', gap: 2, maxWidth: '100%', overflowX: 'hidden' }}>
              <Typography variant="h6">株価チャート</Typography>
              <StockChart
                tickerId={summary.tickerId}
                timeframe="D"
                count={50}
                holdingPrice={summary.holding?.averagePrice}
              />
              <Divider />
              <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell
                        component="th"
                        scope="row"
                        sx={{ color: 'text.secondary', width: '40%' }}
                      >
                        銘柄名
                      </TableCell>
                      <TableCell>{summary.name}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        始値
                      </TableCell>
                      <TableCell align="right">{summary.open.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        高値
                      </TableCell>
                      <TableCell align="right">{summary.high.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        安値
                      </TableCell>
                      <TableCell align="right">{summary.low.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        終値
                      </TableCell>
                      <TableCell align="right">{summary.close.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        出来高
                      </TableCell>
                      <TableCell align="right">
                        {summary.volume?.toLocaleString('ja-JP') ?? '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        保有数
                      </TableCell>
                      <TableCell>
                        {summary.holding?.quantity.toLocaleString('ja-JP') ?? '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        平均取得価格
                      </TableCell>
                      <TableCell>
                        {summary.holding ? summary.holding.averagePrice.toFixed(2) : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        更新日時
                      </TableCell>
                      <TableCell>{new Date(summary.updatedAt).toLocaleString('ja-JP')}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              <Divider />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outline" onClick={() => openAlertModal('Buy', summary.close)}>
                  買いアラート設定
                </Button>
                {summary.holding && (
                  <Button variant="outline" onClick={() => openAlertModal('Sell', summary.close)}>
                    売りアラート設定
                  </Button>
                )}
              </Box>
              <Divider />
              <Typography variant="h6">パターン分析</Typography>
              <Box sx={{ display: 'grid', gap: 1 }} data-testid="pattern-analysis-buy">
                <Typography variant="subtitle2">買いパターン</Typography>
                <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                  <Table size="small">
                    <TableBody>
                      {buyPatternDetails.map((pattern) => (
                        <TableRow key={pattern.patternId}>
                          <TableCell>
                            <Tooltip title={pattern.description}>
                              <Typography
                                component="span"
                                variant="body2"
                                aria-label={pattern.description}
                                sx={{
                                  textDecoration: 'underline',
                                  textDecorationStyle: 'dotted',
                                  cursor: 'help',
                                }}
                              >
                                {pattern.name}
                              </Typography>
                            </Tooltip>
                            {pattern.status === 'INSUFFICIENT_DATA' && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block' }}
                              >
                                理由: {UI_ERROR_MESSAGES.INSUFFICIENT_DATA_REASON}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ width: '10%' }}>
                            <Typography
                              component="span"
                              data-testid={`pattern-status-${pattern.patternId}`}
                              color={
                                pattern.status === 'MATCHED'
                                  ? 'success.main'
                                  : pattern.status === 'INSUFFICIENT_DATA'
                                    ? 'text.disabled'
                                    : 'text.secondary'
                              }
                              sx={{ fontWeight: 'bold' }}
                            >
                              {pattern.status === 'MATCHED'
                                ? '✓'
                                : pattern.status === 'INSUFFICIENT_DATA'
                                  ? '-'
                                  : '✗'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
              <Box sx={{ display: 'grid', gap: 1 }} data-testid="pattern-analysis-sell">
                <Typography variant="subtitle2">売りパターン</Typography>
                <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                  <Table size="small">
                    <TableBody>
                      {sellPatternDetails.map((pattern) => (
                        <TableRow key={pattern.patternId}>
                          <TableCell>
                            <Tooltip title={pattern.description}>
                              <Typography
                                component="span"
                                variant="body2"
                                aria-label={pattern.description}
                                sx={{
                                  textDecoration: 'underline',
                                  textDecorationStyle: 'dotted',
                                  cursor: 'help',
                                }}
                              >
                                {pattern.name}
                              </Typography>
                            </Tooltip>
                            {pattern.status === 'INSUFFICIENT_DATA' && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block' }}
                              >
                                理由: {UI_ERROR_MESSAGES.INSUFFICIENT_DATA_REASON}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ width: '10%' }}>
                            <Typography
                              component="span"
                              data-testid={`pattern-status-${pattern.patternId}`}
                              color={
                                pattern.status === 'MATCHED'
                                  ? 'success.main'
                                  : pattern.status === 'INSUFFICIENT_DATA'
                                    ? 'text.disabled'
                                    : 'text.secondary'
                              }
                              sx={{ fontWeight: 'bold' }}
                            >
                              {pattern.status === 'MATCHED'
                                ? '✓'
                                : pattern.status === 'INSUFFICIENT_DATA'
                                  ? '-'
                                  : '✗'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
              <Box component="section" aria-labelledby="ai-analysis-heading">
                <Divider sx={{ mb: 2 }} />
                <Typography id="ai-analysis-heading" variant="h6">
                  AI 解析
                </Typography>
                {summary.aiAnalysisResult ? (
                  <Box sx={{ mt: 2, display: 'grid', gap: 2 }}>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        当日の値動き分析
                      </Typography>
                      <Typography sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {summary.aiAnalysisResult.priceMovementAnalysis}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        パターン分析
                      </Typography>
                      <Typography sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {summary.aiAnalysisResult.patternAnalysis}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                        サポートレベル
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {summary.aiAnalysisResult.supportLevels.map((level, index) => (
                          <Chip
                            key={`support-${level}-${index}`}
                            size="sm"
                            onClick={(e) =>
                              setChipMenuAnchor({ element: e.currentTarget, price: level })
                            }
                          >
                            {`${level}`}
                          </Chip>
                        ))}
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                        レジスタンスレベル
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {summary.aiAnalysisResult.resistanceLevels.map((level, index) => (
                          <Chip
                            key={`resistance-${level}-${index}`}
                            size="sm"
                            onClick={(e) =>
                              setChipMenuAnchor({ element: e.currentTarget, price: level })
                            }
                          >
                            {`${level}`}
                          </Chip>
                        ))}
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        関連市場・セクター動向
                      </Typography>
                      <Typography sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {summary.aiAnalysisResult.relatedMarketTrend}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                        投資判断
                      </Typography>
                      <Chip
                        color={
                          summary.aiAnalysisResult.investmentJudgment.signal === 'BULLISH'
                            ? 'success'
                            : summary.aiAnalysisResult.investmentJudgment.signal === 'BEARISH'
                              ? 'danger'
                              : 'neutral'
                        }
                        size="sm"
                        className="mb-1"
                      >
                        {
                          INVESTMENT_SIGNAL_LABELS[
                            summary.aiAnalysisResult.investmentJudgment.signal
                          ]
                        }
                      </Chip>
                      <Typography sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {summary.aiAnalysisResult.investmentJudgment.reason}
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography sx={{ mt: 2 }} color="text.secondary">
                    {resolveAiAnalysisFallbackMessage(summary)}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
      <Menu
        anchorEl={chipMenuAnchor?.element ?? null}
        open={Boolean(chipMenuAnchor)}
        onClose={() => setChipMenuAnchor(null)}
      >
        <MenuItem onClick={() => openAlertModal('Buy', chipMenuAnchor!.price)}>
          買いアラートを設定
        </MenuItem>
        <MenuItem onClick={() => openAlertModal('Sell', chipMenuAnchor!.price)}>
          売りアラートを設定
        </MenuItem>
      </Menu>
      {summary && (
        <AlertSettingsModal
          open={alertModalState.open}
          onClose={() => setAlertModalState((s) => ({ ...s, open: false }))}
          onSuccess={onAlertChanged}
          tickerId={summary.tickerId}
          symbol={summary.symbol}
          exchangeId={selectedTickerExchangeId}
          mode="create"
          tradeMode={alertModalState.tradeMode}
          defaultTargetPrice={alertModalState.initialPrice}
          basePrice={summary.close}
        />
      )}
    </>
  );
}
