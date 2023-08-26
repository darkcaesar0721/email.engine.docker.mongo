import { Topics } from "../topics";
import { MailVerificationRequestedEvent } from "./MailVerificationRequestedEvent";

export interface OutlookCheckRequestedEvent extends MailVerificationRequestedEvent {
  topic: Topics.OutlookCheckRequested;
}