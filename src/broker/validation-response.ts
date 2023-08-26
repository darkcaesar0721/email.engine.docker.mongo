import { ResultType } from '../worker/base-validator';

export interface CheckResponse {
  id: string;
  email: string;
  domain: string;
  valid: boolean;
}

export interface ValidationResponse {
  id: string;
  email: string;
  domain: string;
  valid: boolean;
  ip: string;
  reason: ResultType;
  isSMTP: boolean;
  checkSmtp?: {
    hotmail: boolean;
  },
  checkHttp?: {
    ovh?: boolean;
    gmail?: boolean;
    outlook?: boolean;
  },
  validatedRelay?: string;
  validatedWorker?: string;
  validationTime?: number;
  validationMethod?: string;
  customValidationResult?: {
    valid: boolean;
    regex?: {
      valid: boolean;
      reason?: string;
    };
    typo?: {
      valid: boolean;
      reason?: string;
    };
    disposable?: {
      valid: boolean;
      reason?: string;
    };
    mx?: {
      valid: boolean;
      reason?: string;
    };
    smtp?: {
      valid: boolean;
      reason?: string;
      messages?: string[];
    };
  },
  redirect?: string;
}