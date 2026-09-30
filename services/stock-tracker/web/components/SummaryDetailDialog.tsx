'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  ButtonBase,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { Button } from '@nagiyu/ui';
import { ChevronRight as ChevronRightIcon, Close as CloseIcon } from '@mui/icons-material';
import AlertSettingsModal from './AlertSettingsModal';
import AxisBreakdownTable from './AxisBreakdownTable';
import ForecastLabelChip from './ForecastLabelChip';
import StockChart from './StockChart';
import type { TickerSummary } from '@/types/stock';
import type { AlertMode } from '@/types/alert';
import type { ForecastDetailResponse, QuestionDetail } from '@/types/forecast';
import {
  FORECAST_TEXT,
  formatBandHistory,
  formatProbabilityWithUsual,
  formatReferenceDate,
  isBandLowSample,
  splitAxes,
  toProbabilityView,
} from '@/lib/forecast-view/labels';
import { ERROR_MESSAGES } from '@/lib/error-messages';
import { fetchForecastDetail } from '@/lib/forecast-view/fetch-detail';

interface SummaryDetailDialogProps {
  open: boolean;
  summary: TickerSummary | null;
  onClose: () => void;
  onAlertChanged?: () => Promise<void>;
}

type DetailQuestion = 'DIR' | 'VOL';

type ForecastLoadState =
  | { status: 'loading' }
  | { status: 'ok'; data: ForecastDetailResponse }
  | { status: 'unavailable' }
  | { status: 'error' };

const QUESTION_TITLES: Record<DetailQuestion, string> = {
  DIR: '方向',
  VOL: '荒れ',
};

const UNAVAILABLE_MESSAGES = {
  unavailable: FORECAST_TEXT.NO_FORECAST,
  error: ERROR_MESSAGES.FORECAST_FETCH_FAILED,
} as const;

const extractExchangeId = (tickerId: string): string => {
  const [exchangeId, symbol] = tickerId.split(':');
  return exchangeId && symbol ? exchangeId : '';
};

interface ForecastCardProps {
  question: DetailQuestion;
  detail: QuestionDetail | null;
  unavailableReason: string;
}

function ForecastCard({ question, detail, unavailableReason }: ForecastCardProps) {
  const view = toProbabilityView(detail);
  return (
    <Box
      data-testid={`forecast-card-${question}`}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}
    >
      <Typography variant="subtitle2" color="text.secondary">
        {QUESTION_TITLES[question]}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <ForecastLabelChip
          question={question}
          view={view}
          size="md"
          unavailableReason={unavailableReason}
          data-testid={`forecast-label-${question}`}
        />
        {detail && (
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid={`forecast-probability-${question}`}
          >
            {formatProbabilityWithUsual(question, detail)}
          </Typography>
        )}
      </Box>
      {detail?.bandHistory && (
        <Box sx={{ mt: 0.5 }} data-testid={`forecast-band-${question}`}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {formatBandHistory(detail.bandHistory)}
          </Typography>
          {isBandLowSample(detail.bandHistory) && (
            <Typography variant="caption" color="warning.main">
              {FORECAST_TEXT.LOW_SAMPLE_BAND}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

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
  const [loaded, setLoaded] = useState<{ key: string; state: ForecastLoadState } | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<DetailQuestion>('DIR');
  const [inactiveOpen, setInactiveOpen] = useState(false);

  const tickerId = summary?.tickerId ?? null;
  const summaryDate = summary?.date ?? '';

  // 開くたびに、その銘柄・基準日の確度を取り直す
  useEffect(() => {
    if (!open || tickerId === null) {
      return;
    }
    const requestKey = `${tickerId}|${summaryDate}`;
    let cancelled = false;
    setActiveQuestion('DIR');
    setInactiveOpen(false);
    void fetchForecastDetail(tickerId, summaryDate).then((result) => {
      if (!cancelled) {
        setLoaded({ key: requestKey, state: result });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, tickerId, summaryDate]);

  // 別の銘柄・日付や閉じた後に、前回の結果を一瞬でも描画しないよう、キーが一致するときだけ採用する
  const forecastState: ForecastLoadState =
    open && loaded && loaded.key === `${tickerId}|${summaryDate}`
      ? loaded.state
      : { status: 'loading' };

  const handleClose = () => {
    setAlertModalState((s) => ({ ...s, open: false }));
    onClose();
  };

  const openAlertModal = (tradeMode: AlertMode, initialPrice: number) => {
    setAlertModalState({ open: true, tradeMode, initialPrice });
  };

  const selectedTickerExchangeId = summary ? extractExchangeId(summary.tickerId) : '';
  const forecastData = forecastState.status === 'ok' ? forecastState.data : null;
  const referenceDate = formatReferenceDate(forecastData?.date ?? summary?.date);
  const activeDetail = forecastData?.questions[activeQuestion] ?? null;
  const axes = activeDetail ? splitAxes(activeDetail.axes) : null;
  const unavailableMessage =
    forecastState.status === 'unavailable' || forecastState.status === 'error'
      ? UNAVAILABLE_MESSAGES[forecastState.status]
      : null;

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
          <Box component="span" sx={{ minWidth: 0 }}>
            {summary?.symbol}
            {summary && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {summary.name}
                {referenceDate && ` ／ ${referenceDate}`}
              </Typography>
            )}
          </Box>
          <IconButton onClick={handleClose} size="small" aria-label="閉じる">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ overflowX: 'hidden' }}>
          {summary && (
            <Box sx={{ display: 'grid', gap: 2, maxWidth: '100%', overflowX: 'hidden' }}>
              <Typography variant="h6">確度</Typography>
              {forecastState.status === 'loading' ? (
                <Typography color="text.secondary">読み込み中...</Typography>
              ) : (
                <>
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 1.5,
                      gridTemplateColumns: {
                        xs: 'minmax(0, 1fr)',
                        sm: 'repeat(2, minmax(0, 1fr))',
                      },
                    }}
                  >
                    {(['DIR', 'VOL'] as const).map((question) => (
                      <ForecastCard
                        key={question}
                        question={question}
                        detail={forecastData?.questions[question] ?? null}
                        unavailableReason={
                          unavailableMessage ??
                          (question === 'VOL'
                            ? FORECAST_TEXT.NO_HISTORY
                            : FORECAST_TEXT.NO_FORECAST)
                        }
                      />
                    ))}
                  </Box>
                  {unavailableMessage ? (
                    <Typography color="text.secondary" data-testid="forecast-unavailable-reason">
                      {unavailableMessage}
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'grid', gap: 1 }}>
                      <Tabs
                        value={activeQuestion}
                        onChange={(_event, value: DetailQuestion) => {
                          // 開いた行や折りたたみを一括で閉じる手段をタブ切り替えで兼ねるため、展開状態を初期化する
                          setActiveQuestion(value);
                          setInactiveOpen(false);
                        }}
                        aria-label="内訳の切り替え"
                      >
                        <Tab value="DIR" label="方向の内訳" />
                        <Tab value="VOL" label="荒れの内訳" />
                      </Tabs>
                      {activeDetail && axes ? (
                        <>
                          <AxisBreakdownTable
                            key={`${activeQuestion}-active`}
                            axes={axes.active}
                            testIdPrefix={`breakdown-${activeQuestion}`}
                          />
                          {axes.inactive.length > 0 && (
                            <Box data-testid={`breakdown-${activeQuestion}-inactive`}>
                              <ButtonBase
                                onClick={() => setInactiveOpen((current) => !current)}
                                aria-expanded={inactiveOpen}
                                aria-controls={`breakdown-${activeQuestion}-inactive-panel`}
                                data-testid={`breakdown-${activeQuestion}-inactive-toggle`}
                                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5 }}
                              >
                                <ChevronRightIcon
                                  fontSize="small"
                                  sx={{
                                    // 閉じている=右向き、開いている=下向きにそろえる
                                    transform: inactiveOpen ? 'rotate(90deg)' : 'none',
                                    transition: 'transform 0.2s',
                                  }}
                                />
                                点灯しなかった軸（{axes.inactive.length}）
                              </ButtonBase>
                              <Collapse
                                in={inactiveOpen}
                                unmountOnExit
                                id={`breakdown-${activeQuestion}-inactive-panel`}
                              >
                                <AxisBreakdownTable
                                  key={`${activeQuestion}-inactive`}
                                  axes={axes.inactive}
                                  testIdPrefix={`breakdown-${activeQuestion}-off`}
                                />
                              </Collapse>
                            </Box>
                          )}
                        </>
                      ) : (
                        <Typography color="text.secondary" data-testid="breakdown-unavailable">
                          {activeQuestion === 'VOL'
                            ? FORECAST_TEXT.NO_HISTORY
                            : FORECAST_TEXT.NO_FORECAST}
                        </Typography>
                      )}
                    </Box>
                  )}
                </>
              )}
              <Divider />
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
            </Box>
          )}
        </DialogContent>
      </Dialog>
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
