import {
  HighlightService,
  JobService,
  DOMAIN_ERROR_MESSAGES as CORE_DOMAIN_ERROR_MESSAGES,
  type HighlightStatus,
  type HighlightRepository,
  type JobRepository,
} from '@nagiyu/quick-clip-core';

export const DOMAIN_ERROR_MESSAGES = {
  ...CORE_DOMAIN_ERROR_MESSAGES,
} as const;

export class JobDomainService extends JobService {
  constructor(repository: JobRepository) {
    super(repository);
  }
}

export class HighlightDomainService extends HighlightService {
  constructor(repository: HighlightRepository) {
    super(repository);
  }
}

export const isHighlightStatus = (value: unknown): value is HighlightStatus =>
  value === 'accepted' || value === 'rejected' || value === 'pending';
