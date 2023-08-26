import { Topics } from "../topics";
import { MailVerificationRequestedEvent } from "./MailVerificationRequestedEvent";

export interface OvhCheckRequested extends MailVerificationRequestedEvent {
  topic: Topics.OvhCheckRequested;
}