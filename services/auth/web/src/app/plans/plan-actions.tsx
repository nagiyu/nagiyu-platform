'use client';

import { useState } from 'react';
import { Box } from '@mui/material';
import { Button, ConfirmDialog, ErrorAlert } from '@nagiyu/ui';
import { useRouter } from 'next/navigation';
import {
  requestCancelScheduledChange,
  requestRedirectUrl,
  requestScheduleDowngrade,
} from '../../lib/billing-client';
import { navigateTo } from '../../lib/navigate';

interface PlanActionButtonProps {
  endpoint: '/api/billing/checkout' | '/api/billing/portal' | '/api/billing/plan-change';
  body: Record<string, unknown>;
  label: string;
  variant?: 'solid' | 'outline';
}

export function PlanActionButton({
  endpoint,
  body,
  label,
  variant = 'solid',
}: PlanActionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const result = await requestRedirectUrl(endpoint, body);
    if (result.ok) {
      // 遷移が終わるまでボタンを押せないままにして、二重に申し込ませない
      navigateTo(result.url);
      return;
    }
    setError(result.message);
    setLoading(false);
  };

  return (
    <Box>
      <Button variant={variant} loading={loading} onClick={handleClick}>
        {label}
      </Button>
      {error && (
        <Box sx={{ mt: 1 }}>
          <ErrorAlert message={error} />
        </Box>
      )}
    </Box>
  );
}

interface ScheduledChangeCancelButtonProps {
  serviceId: string;
}

export function ScheduledChangeCancelButton({ serviceId }: ScheduledChangeCancelButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const result = await requestCancelScheduledChange(serviceId);
    if (result.ok) {
      // 予約が消えた状態を読み直す。再読み込みが終わるまで押せないままにして二重に送らせない
      router.refresh();
      return;
    }
    setError(result.message);
    setLoading(false);
  };

  return (
    <Box>
      <Button variant="outline" loading={loading} onClick={handleClick}>
        予約を取り消す
      </Button>
      {error && (
        <Box sx={{ mt: 1 }}>
          <ErrorAlert message={error} />
        </Box>
      )}
    </Box>
  );
}

interface DowngradeButtonProps {
  roleId: string;
  callbackUrl: string | null;
  /** 変わる日と、それまでは今の段のままであること、返金がないことを伝える本文 */
  confirmMessage: string;
  label: string;
}

/** 下げは即時には効かないため、押したら確認を挟み、確定で期末への予約を作る */
export function DowngradeButton({
  roleId,
  callbackUrl,
  confirmMessage,
  label,
}: DowngradeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const result = await requestScheduleDowngrade(roleId, callbackUrl);
    if (result.ok) {
      // 予約の表示と取り消しのボタンが出る状態を読み直す。終わるまで閉じず、押せないままにして二重に送らせない
      router.refresh();
      return;
    }
    setError(result.message);
    setLoading(false);
  };

  return (
    <Box>
      <Button variant="solid" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title="プランの変更を予約します"
        description={confirmMessage}
        confirmLabel="変更を予約する"
        cancelLabel="やめる"
        confirmColor="primary"
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
      >
        {error && <ErrorAlert message={error} />}
      </ConfirmDialog>
    </Box>
  );
}
