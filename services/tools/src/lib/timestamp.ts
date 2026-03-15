export const ERROR_MESSAGES = {
  INVALID_UNIX_TIMESTAMP: 'Unixタイムスタンプは整数で入力してください。',
  INVALID_DATETIME: '日時は YYYY-MM-DDTHH:mm または YYYY-MM-DDTHH:mm:ss 形式で入力してください。',
  INVALID_TIMEZONE: '無効なタイムゾーンです。',
} as const;

export const STOCK_TRACKER_TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'America/New_York (NYSE, NASDAQ)' },
  { value: 'America/Chicago', label: 'America/Chicago (CME)' },
  { value: 'Europe/London', label: 'Europe/London (LSE)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (Euronext)' },
  { value: 'Europe/Frankfurt', label: 'Europe/Frankfurt (FWB)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (TSE)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKEX)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (SSE)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGX)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (ASX)' },
] as const;

export interface TimestampConversionResult {
  dateTimeInTimeZone: string;
  isoUtc: string;
  unixSeconds: number;
  unixMilliseconds: number;
  timeZone: string;
}

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const extractPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string => {
  return parts.find((part) => part.type === type)?.value ?? '';
};

const validateTimezone = (timeZone: string): void => {
  try {
    new Intl.DateTimeFormat('ja-JP', { timeZone }).format(new Date());
  } catch {
    throw new Error(ERROR_MESSAGES.INVALID_TIMEZONE);
  }
};

const parseUnixInteger = (value: number | string): number => {
  const normalized = typeof value === 'number' ? String(value) : value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(ERROR_MESSAGES.INVALID_UNIX_TIMESTAMP);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(ERROR_MESSAGES.INVALID_UNIX_TIMESTAMP);
  }

  return parsed;
};

const parseDateTime = (value: string): DateTimeParts => {
  const match = DATETIME_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(ERROR_MESSAGES.INVALID_DATETIME);
  }

  const parts: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? '0'),
  };

  const utcDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  );
  if (
    utcDate.getUTCFullYear() !== parts.year ||
    utcDate.getUTCMonth() + 1 !== parts.month ||
    utcDate.getUTCDate() !== parts.day ||
    utcDate.getUTCHours() !== parts.hour ||
    utcDate.getUTCMinutes() !== parts.minute ||
    utcDate.getUTCSeconds() !== parts.second
  ) {
    throw new Error(ERROR_MESSAGES.INVALID_DATETIME);
  }

  return parts;
};

const formatDateTimeInTimeZone = (date: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const year = extractPart(parts, 'year');
  const month = extractPart(parts, 'month');
  const day = extractPart(parts, 'day');
  const hour = extractPart(parts, 'hour');
  const minute = extractPart(parts, 'minute');
  const second = extractPart(parts, 'second');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const getTimeZoneOffsetMilliseconds = (timeZone: string, date: Date): number => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);

  const year = Number(extractPart(parts, 'year'));
  const month = Number(extractPart(parts, 'month'));
  const day = Number(extractPart(parts, 'day'));
  const hour = Number(extractPart(parts, 'hour'));
  const minute = Number(extractPart(parts, 'minute'));
  const second = Number(extractPart(parts, 'second'));

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - date.getTime();
};

const toTimeZoneUnixMilliseconds = (dateTime: string, timeZone: string): number => {
  const parsed = parseDateTime(dateTime);
  const assumedUtc = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second
  );

  let offset = getTimeZoneOffsetMilliseconds(timeZone, new Date(assumedUtc));
  let unixMilliseconds = assumedUtc - offset;
  const recalculatedOffset = getTimeZoneOffsetMilliseconds(timeZone, new Date(unixMilliseconds));
  if (recalculatedOffset !== offset) {
    offset = recalculatedOffset;
    unixMilliseconds = assumedUtc - offset;
  }

  const expectedDateTime = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')} ${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}:${String(parsed.second).padStart(2, '0')}`;
  const roundTrip = formatDateTimeInTimeZone(new Date(unixMilliseconds), timeZone);
  if (roundTrip !== expectedDateTime) {
    throw new Error(ERROR_MESSAGES.INVALID_DATETIME);
  }

  return unixMilliseconds;
};

const buildResult = (unixMilliseconds: number, timeZone: string): TimestampConversionResult => {
  const date = new Date(unixMilliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error(ERROR_MESSAGES.INVALID_UNIX_TIMESTAMP);
  }

  return {
    dateTimeInTimeZone: formatDateTimeInTimeZone(date, timeZone),
    isoUtc: date.toISOString(),
    unixSeconds: Math.floor(unixMilliseconds / 1000),
    unixMilliseconds,
    timeZone,
  };
};

export const convertUnixSecondsToDateTime = (
  unixSeconds: number | string,
  timeZone: string
): TimestampConversionResult => {
  validateTimezone(timeZone);
  const seconds = parseUnixInteger(unixSeconds);
  const unixMilliseconds = seconds * 1000;
  if (!Number.isSafeInteger(unixMilliseconds)) {
    throw new Error(ERROR_MESSAGES.INVALID_UNIX_TIMESTAMP);
  }

  return buildResult(unixMilliseconds, timeZone);
};

export const convertUnixMillisecondsToDateTime = (
  unixMilliseconds: number | string,
  timeZone: string
): TimestampConversionResult => {
  validateTimezone(timeZone);
  const milliseconds = parseUnixInteger(unixMilliseconds);
  return buildResult(milliseconds, timeZone);
};

export const convertDateTimeToUnixTimestamp = (
  dateTime: string,
  timeZone: string
): TimestampConversionResult => {
  validateTimezone(timeZone);
  return buildResult(toTimeZoneUnixMilliseconds(dateTime, timeZone), timeZone);
};
