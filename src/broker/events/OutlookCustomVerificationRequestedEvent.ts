import { Topics } from "../topics";
import { MailVerificationRequestedEvent } from "./MailVerificationRequestedEvent";

export interface OutlookCustomVerificationRequestedEvent extends MailVerificationRequestedEvent {
  topic: Topics.OutlookCustomVerificationRequested;
}