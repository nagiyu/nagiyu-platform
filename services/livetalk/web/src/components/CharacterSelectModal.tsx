'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { Button } from '@nagiyu/ui';
import { useCharacter } from '@/lib/characters/CharacterContext';
import {
  getCharacterDescription,
  getCharacterDisplay,
  getRegisteredProfileIds,
} from '@/lib/characters/client-profiles';

export interface CharacterSelectModalProps {
  open: boolean;
  onClose: () => void;
}

const DIALOG_TITLE_ID = 'character-select-modal-title';

/**
 * キャラクターを選択するモーダル。
 * 登録済みキャラクターをラジオボタンで一覧表示し、決定ボタンで切り替える。
 */
export default function CharacterSelectModal({ open, onClose }: CharacterSelectModalProps) {
  const { characterId, setCharacterId } = useCharacter();
  const [selected, setSelected] = useState<string>(characterId);

  // モーダルが開いたとき、または characterId が変化したときにローカル state を同期する
  useEffect(() => {
    if (open) {
      setSelected(characterId);
    }
  }, [open, characterId]);

  const handleDecide = () => {
    setCharacterId(selected);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const profileIds = getRegisteredProfileIds();

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      fullWidth
      maxWidth="xs"
      aria-labelledby={DIALOG_TITLE_ID}
    >
      <DialogTitle id={DIALOG_TITLE_ID}>キャラクターを選ぶ</DialogTitle>

      <DialogContent>
        <RadioGroup
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="キャラクター選択"
        >
          {profileIds.map((id) => {
            const display = getCharacterDisplay(id);
            const description = getCharacterDescription(id);
            return (
              <FormControlLabel
                key={id}
                value={id}
                control={<Radio />}
                label={
                  <Box>
                    <Typography sx={{ fontWeight: 'bold' }}>{display.displayName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {description}
                    </Typography>
                  </Box>
                }
              />
            );
          })}
        </RadioGroup>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outline" color="neutral" onClick={handleCancel}>
          キャンセル
        </Button>
        <Button variant="solid" color="primary" onClick={handleDecide}>
          決定
        </Button>
      </DialogActions>
    </Dialog>
  );
}
