import { Topics } from "../topics";
import { MailVerificationRequestedEvent } from "./MailVerificationRequestedEvent";

export interface HotmailSmtpCheckRequestedEvent extends MailVerificationRequestedEvent {
  topic: Topics.HotmailSmtpCheckRequested;
}