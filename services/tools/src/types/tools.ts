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
