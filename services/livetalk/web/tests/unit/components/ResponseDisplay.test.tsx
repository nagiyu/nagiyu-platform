import React from 'react';
import { render, screen } from '@testing-library/react';
import ResponseDisplay from '@/components/ResponseDisplay';

describe('ResponseDisplay', () => {
  describe('待機メッセージの表示名', () => {
    it('characterId を渡すと、そのキャラの表示名で待機メッセージを表示する', () => {
      render(<ResponseDisplay text={null} userText={null} characterId="ageha" />);
      expect(
        screen.getByText('メッセージを入力すると、早瀬アゲハがお話しします。')
      ).toBeInTheDocument();
    });

    it('characterId に hiyori を渡すと、桃瀬ひよりの表示名で待機メッセージを表示する', () => {
      render(<ResponseDisplay text={null} userText={null} characterId="hiyori" />);
      expect(
        screen.getByText('メッセージを入力すると、桃瀬ひよりがお話しします。')
      ).toBeInTheDocument();
    });

    it('characterId 省略時は既定キャラの表示名を使う', () => {
      render(<ResponseDisplay text={null} userText={null} />);
      expect(
        screen.getByText('メッセージを入力すると、桃瀬ひよりがお話しします。')
      ).toBeInTheDocument();
    });
  });

  describe('応答ラベルの短縮名', () => {
    it('応答テキストがあるとき、選択中キャラの短縮名をラベル表示する', () => {
      render(<ResponseDisplay text="やっほー！" userText="こんにちは" characterId="ageha" />);
      expect(screen.getByText('アゲハ')).toBeInTheDocument();
      expect(screen.getByText('やっほー！')).toBeInTheDocument();
      expect(screen.getByText('あなた')).toBeInTheDocument();
      expect(screen.getByText('こんにちは')).toBeInTheDocument();
    });
  });
});
