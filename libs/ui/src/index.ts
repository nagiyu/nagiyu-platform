// Export UI components and theme here
export { default as theme } from './styles/theme';
export { tokens, breakpoints } from './styles/tokens';
export type { ThemeMode, ColorRole, Size } from './styles/tokens';
export { default as Button } from './components/Button';
export type { ButtonProps, ButtonVariant, ButtonColor, ButtonSize } from './components/Button';
export { default as TextField } from './components/TextField';
export type { TextFieldProps, TextFieldSize, TextFieldType } from './components/TextField';
export { default as Checkbox } from './components/Checkbox';
export type { CheckboxProps, CheckboxSize } from './components/Checkbox';
export { default as Chip } from './components/Chip';
export type { ChipProps, ChipVariant, ChipColor, ChipSize } from './components/Chip';
export { default as Header } from './components/layout/Header';
export type { HeaderProps, NavigationItem } from './components/layout/Header';
export { default as Footer } from './components/layout/Footer';
export type { FooterProps } from './components/layout/Footer';
export { default as AppLayout } from './components/layout/AppLayout';
export type { AppLayoutProps } from './components/layout/AppLayout';
export { default as ServiceLayout } from './components/layout/ServiceLayout';
export type { ServiceLayoutProps } from './components/layout/ServiceLayout';
export { default as ServiceWorkerRegistration } from './components/ServiceWorkerRegistration';
export type { ServiceWorkerRegistrationProps } from './components/ServiceWorkerRegistration';
export { SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES } from './components/ServiceWorkerRegistration';
export { default as PrivacyPolicyDialog } from './components/dialogs/PrivacyPolicyDialog';
export type { PrivacyPolicyDialogProps } from './components/dialogs/PrivacyPolicyDialog';
export { default as TermsOfServiceDialog } from './components/dialogs/TermsOfServiceDialog';
export type { TermsOfServiceDialogProps } from './components/dialogs/TermsOfServiceDialog';
export { ErrorBoundary, useErrorHandler } from './components/error/ErrorBoundary';
export type { ErrorBoundaryProps } from './components/error/ErrorBoundary';
export { default as ErrorAlert } from './components/error/ErrorAlert';
export type { ErrorAlertProps } from './components/error/ErrorAlert';
export { default as LoadingState } from './components/loading/LoadingState';
export type { LoadingStateProps } from './components/loading/LoadingState';

// Export data
export { privacyPolicySections } from './data/privacyPolicyData';
export type { PolicySection, PolicyContent, PolicySubContent } from './data/privacyPolicyData';
export { termSections } from './data/termsOfServiceData';
export type { TermSection, TermContent } from './data/termsOfServiceData';
