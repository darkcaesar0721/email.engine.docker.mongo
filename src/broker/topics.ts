export enum Topics {
  RequestCompleted = 'request-completed',
  
  VerificationFinished = 'verification-finished',
  VerificationFailed = 'verification-failed',
  VerificationBounced = 'verification-bounced',

  HotmailSmtpCheckRequested = 'hotmail-smtp-check-requested',
  GmailCheckRequested = 'gmail-check-requested',
  OutlookCheckRequested = 'outlook-check-requested',
  OvhCheckRequested = 'ovh-check-requested',

  AolVerificationRequested = 'aol-verification-requested',
  GmailVerificationRequested = 'gmail-verification-requested',
  YahooVerificationRequested = 'yahoo-verification-requested',
  OutlookVerificationRequested = 'outlook-verification-requested',
  OutlookCustomVerificationRequested = 'outlook-customverification-requested',
  MailruVerificationRequested = 'mailru-verification-requested',
  CustomVerificationRequested = 'custom-verification-requested',
  SkynetVerificationRequested = 'skynet-verification-requested',
}