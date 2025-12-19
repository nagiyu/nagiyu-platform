import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { DisplaySettings } from '@/types/tools';

interface DisplaySettingsSectionProps {
  settings: DisplaySettings;
  onChange: (settings: DisplaySettings) => void;
}

export default function DisplaySettingsSection({
  settings,
  onChange,
}: DisplaySettingsSectionProps) {
  const handleChange = (key: keyof DisplaySettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };

    // ルート詳細が無効になった場合、子項目もすべて無効にする
    if (key === 'showRouteDetails' && !newSettings.showRouteDetails) {
      newSettings.showTimeRange = false;
      newSettings.showLineName = false;
      newSettings.showPlatform = false;
    }

    // ルート詳細の子項目がすべて有効になった場合、親も有効にする
    if (
      (key === 'showTimeRange' || key === 'showLineName' || key === 'showPlatform') &&
      newSettings[key]
    ) {
      newSettings.showRouteDetails = true;
    }

    onChange(newSettings);
  };

  return (
    <Accordion>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="display-settings-content"
        id="display-settings-header"
      >
        <Typography>表示設定</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showDate}
                onChange={() => handleChange('showDate')}
              />
            }
            label="日付を表示"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showDepartureArrival}
                onChange={() => handleChange('showDepartureArrival')}
              />
            }
            label="出発地・到着地を表示"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showTime}
                onChange={() => handleChange('showTime')}
              />
            }
            label="出発時刻・到着時刻を表示"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showDuration}
                onChange={() => handleChange('showDuration')}
              />
            }
            label="所要時間を表示"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showFare}
                onChange={() => handleChange('showFare')}
              />
            }
            label="運賃を表示"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showTransferCount}
                onChange={() => handleChange('showTransferCount')}
              />
            }
            label="乗換回数を表示"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showDistance}
                onChange={() => handleChange('showDistance')}
              />
            }
            label="距離を表示"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showRouteDetails}
                onChange={() => handleChange('showRouteDetails')}
              />
            }
            label="ルート詳細を表示"
          />
          <Box sx={{ pl: 4, display: 'flex', flexDirection: 'column' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.showTimeRange}
                  onChange={() => handleChange('showTimeRange')}
                  disabled={!settings.showRouteDetails}
                />
              }
              label="時刻範囲を表示"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.showLineName}
                  onChange={() => handleChange('showLineName')}
                  disabled={!settings.showRouteDetails}
                />
              }
              label="路線名を表示"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.showPlatform}
                  onChange={() => handleChange('showPlatform')}
                  disabled={!settings.showRouteDetails}
                />
              }
              label="番線情報を表示"
            />
          </Box>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
