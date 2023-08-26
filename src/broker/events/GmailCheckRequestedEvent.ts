import { Topics } from "../topics";
import { MailVerificationRequestedEvent } from "./MailVerificationRequestedEvent";

export interface GmailCheckRequestedEvent extends MailVerificationRequestedEvent {
  topic: Topics.GmailCheckRequested;
}