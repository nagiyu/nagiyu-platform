import { ReactNode } from 'react';

export interface Tool {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  href: string;
  category?: string;
}

export interface TransitRoute {
  departure: string;
  arrival: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  fare: string;
  transferCount?: number;
  distance?: string;
  routeSteps: RouteStep[];
}

export interface RouteStep {
  station: string;
  timeRange?: string;
  line?: string;
  platform?: string;
}

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
}

export interface DisplaySettings {
  showDate: boolean;
  showDepartureArrival: boolean;
  showTime: boolean;
  showDuration: boolean;
  showFare: boolean;
  showTransferCount: boolean;
  showDistance: boolean;
  showRouteDetails: boolean;
  showTimeRange: boolean;
  showLineName: boolean;
  showPlatform: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showDate: true,
  showDepartureArrival: true,
  showTime: true,
  showDuration: true,
  showFare: true,
  showTransferCount: true,
  showDistance: false,
  showRouteDetails: true,
  showTimeRange: true,
  showLineName: true,
  showPlatform: false,
};

export interface JsonFormatterResult {
  formatted: string;
  isValid: boolean;
  error?: string;
}
