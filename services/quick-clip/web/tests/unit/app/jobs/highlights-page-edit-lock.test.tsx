import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HighlightsPage from '@/app/jobs/[jobId]/highlights/page';

type HighlightFixture = {
  highlightId: string;
  jobId: string;
  order: number;
  startSec: number;
  endSec: number;
  source: string;
  status: string;
  clipStatus: string;
  clipUrl?: string;
};

const buildHighlight = (
  order: number,
  clipStatus: string,
  overrides: Partial<HighlightFixture> = {}
): HighlightFixture => ({
  highlightId: `h-${order}`,
  jobId: 'job-1',
  order,
  startSec: 10,
  endSec: 20,
  source: 'motion',
  status: 'unconfirmed',
  clipStatus,
  ...overrides,
});

type RoutedFetchOptions = {
  // 一覧の応答。取得のたびに先頭から順に消費し、最後の要素は繰り返す
  lists: HighlightFixture[][];
  recover?: () => Promise<unknown>;
  // 見どころの更新 (PATCH)・作り直し (POST) の応答
  mutate?: () => Promise<unknown>;
};

/**
 * URL ごとに応答を振り分ける fetch のモックを差し込む
 *
 * @returns モックと、復旧・一覧への呼び出し順の記録
 */
const installRoutedFetch = ({ lists, recover, mutate }: RoutedFetchOptions) => {
  let listIndex = 0;
  const calls: string[] = [];
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/highlights/recover')) {
      calls.push('recover');
      return (
        (await recover?.()) ?? {
          ok: true,
          json: async () => ({ recoveredHighlightIds: [] }),
        }
      );
    }
    if (url.endsWith('/highlights')) {
      calls.push('list');
      const highlights = lists[Math.min(listIndex, lists.length - 1)];
      listIndex += 1;
      return { ok: true, json: async () => ({ highlights }) };
    }
    if (url.endsWith('/transcript')) {
      return { ok: true, json: async () => ({ segments: [] }) };
    }
    if (init?.method === 'PATCH' || init?.method === 'POST') {
      return mutate ? mutate() : { ok: false };
    }
    return { ok: false };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, calls };
};

const renderAndSelect = async (order: number) => {
  render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);
  await waitFor(() => {
    expect(screen.getByText(`#${order}`)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText(`#${order}`));
};

const CLIP_GENERATING_MESSAGE = 'クリップを作り直している最中のため、変更できません';

describe('HighlightsPage 作り直し中の操作制御と復旧', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('復旧 API', () => {
    it('一覧の取得の前に復旧 API を呼ぶ', async () => {
      const { fetchMock, calls } = installRoutedFetch({
        lists: [[buildHighlight(1, 'GENERATED')]],
      });

      await renderAndSelect(1);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jobs/job-1/highlights/recover',
        expect.objectContaining({ method: 'POST' })
      );
      expect(calls).toEqual(['recover', 'list']);
    });

    it('ポーリングのたびにも、一覧の取得の前に復旧 API を呼ぶ', async () => {
      jest.useFakeTimers();
      const { calls } = installRoutedFetch({ lists: [[buildHighlight(1, 'GENERATING')]] });

      await renderAndSelect(1);
      expect(calls).toEqual(['recover', 'list']);

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(calls).toEqual(['recover', 'list', 'recover', 'list']);
      });
    });

    it.each([
      ['失敗レスポンス', async () => ({ ok: false, status: 500 })],
      [
        '通信エラー',
        async () => {
          throw new Error('network');
        },
      ],
    ])('復旧 API が%sでも一覧は表示し、エラー表示にはしない', async (_label, recover) => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      installRoutedFetch({ lists: [[buildHighlight(1, 'GENERATED')]], recover });

      await renderAndSelect(1);

      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('開始・終了の入力', () => {
    it('作り直し中 (GENERATING) の見どころは入力を無効にし、他の見どころは止めない', async () => {
      installRoutedFetch({
        lists: [[buildHighlight(1, 'GENERATING'), buildHighlight(2, 'GENERATED')]],
      });

      await renderAndSelect(1);
      const generatingInputs = await screen.findAllByRole('spinbutton');
      expect(generatingInputs).toHaveLength(2);
      generatingInputs.forEach((input) => expect(input).toBeDisabled());

      fireEvent.click(screen.getByText('#2'));
      const generatedInputs = await screen.findAllByRole('spinbutton');
      generatedInputs.forEach((input) => expect(input).toBeEnabled());
    });

    it('PATCH の送信中は入力を無効にし、応答が GENERATING のあいだは無効のまま保つ', async () => {
      let resolvePatch: (value: unknown) => void = () => {};
      const patchResponse = new Promise((resolve) => {
        resolvePatch = resolve;
      });
      const { fetchMock } = installRoutedFetch({
        lists: [[buildHighlight(1, 'GENERATED', { clipUrl: 'https://example.com/h-1.mp4' })]],
        mutate: () => patchResponse,
      });

      await renderAndSelect(1);
      const inputs = await screen.findAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: '11' } });
      fireEvent.blur(inputs[0]);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/jobs/job-1/highlights/h-1',
          expect.objectContaining({ method: 'PATCH' })
        );
        screen.getAllByRole('spinbutton').forEach((input) => expect(input).toBeDisabled());
      });

      await act(async () => {
        resolvePatch({
          ok: true,
          json: async () => buildHighlight(1, 'GENERATING', { startSec: 11 }),
        });
      });

      await waitFor(() => {
        expect(screen.getByText('クリップ生成中...')).toBeInTheDocument();
      });
      screen.getAllByRole('spinbutton').forEach((input) => expect(input).toBeDisabled());
    });

    it('作り直しが終わって GENERATED になったら、入力を再び受け付ける', async () => {
      jest.useFakeTimers();
      installRoutedFetch({
        lists: [
          [buildHighlight(1, 'GENERATING')],
          [buildHighlight(1, 'GENERATED', { clipUrl: 'https://example.com/h-1.mp4' })],
        ],
      });

      await renderAndSelect(1);
      (await screen.findAllByRole('spinbutton')).forEach((input) => expect(input).toBeDisabled());

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        screen.getAllByRole('spinbutton').forEach((input) => expect(input).toBeEnabled());
      });
    });

    it('作り直しが FAILED になったら、入力を再び受け付ける', async () => {
      jest.useFakeTimers();
      installRoutedFetch({
        lists: [[buildHighlight(1, 'GENERATING')], [buildHighlight(1, 'FAILED')]],
      });

      await renderAndSelect(1);
      (await screen.findAllByRole('spinbutton')).forEach((input) => expect(input).toBeDisabled());

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        screen.getAllByRole('spinbutton').forEach((input) => expect(input).toBeEnabled());
      });
    });

    it('サーバーが 409 を返したら、変更できない旨を表示し、画面を実際の状態に合わせる', async () => {
      installRoutedFetch({
        // 画面は GENERATED と思っているが、サーバーではすでに作り直し中という状況
        lists: [[buildHighlight(1, 'GENERATED')], [buildHighlight(1, 'GENERATING')]],
        mutate: async () => ({
          ok: false,
          status: 409,
          json: async () => ({ error: 'CLIP_GENERATING' }),
        }),
      });

      await renderAndSelect(1);
      const inputs = await screen.findAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: '11' } });
      fireEvent.blur(inputs[0]);

      await waitFor(() => {
        expect(screen.getByText(CLIP_GENERATING_MESSAGE)).toBeInTheDocument();
      });
      expect(screen.queryByText('見どころの更新に失敗しました')).not.toBeInTheDocument();
      await waitFor(() => {
        screen.getAllByRole('spinbutton').forEach((input) => expect(input).toBeDisabled());
      });
    });

    it('値を変えずにフォーカスアウトしただけでは PATCH を送らない', async () => {
      const { fetchMock } = installRoutedFetch({ lists: [[buildHighlight(1, 'GENERATED')]] });

      await renderAndSelect(1);
      const inputs = await screen.findAllByRole('spinbutton');
      fireEvent.blur(inputs[0]);

      await waitFor(() => {
        expect(screen.getAllByRole('spinbutton')[0]).toBeEnabled();
      });
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/highlights/h-1'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('リトライボタン', () => {
    it('FAILED のときだけ表示し、GENERATING の見どころには表示しない', async () => {
      installRoutedFetch({
        lists: [[buildHighlight(1, 'GENERATING'), buildHighlight(2, 'FAILED')]],
      });

      await renderAndSelect(1);
      expect(screen.queryByRole('button', { name: 'リトライ' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('#2'));
      expect(await screen.findByRole('button', { name: 'リトライ' })).toBeEnabled();
    });

    it('送信中は押せず、応答後は GENERATING になりボタンが消える', async () => {
      let resolveRegenerate: (value: unknown) => void = () => {};
      const regenerateResponse = new Promise((resolve) => {
        resolveRegenerate = resolve;
      });
      installRoutedFetch({
        lists: [[buildHighlight(1, 'FAILED')]],
        mutate: () => regenerateResponse,
      });

      await renderAndSelect(1);
      fireEvent.click(await screen.findByRole('button', { name: 'リトライ' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'リトライ' })).toBeDisabled();
      });

      await act(async () => {
        resolveRegenerate({ ok: true, json: async () => buildHighlight(1, 'GENERATING') });
      });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'リトライ' })).not.toBeInTheDocument();
      });
    });

    it('作り直しの要求が 409 なら、変更できない旨を表示する', async () => {
      installRoutedFetch({
        lists: [[buildHighlight(1, 'FAILED')], [buildHighlight(1, 'GENERATING')]],
        mutate: async () => ({ ok: false, status: 409, json: async () => ({}) }),
      });

      await renderAndSelect(1);
      fireEvent.click(await screen.findByRole('button', { name: 'リトライ' }));

      await waitFor(() => {
        expect(screen.getByText(CLIP_GENERATING_MESSAGE)).toBeInTheDocument();
      });
      expect(screen.queryByText('クリップの再生成に失敗しました')).not.toBeInTheDocument();
    });
  });
});
