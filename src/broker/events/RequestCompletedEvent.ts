import { Topics } from "../topics";
import { Event } from "./Event";

export interface RequestCompletedEvent extends Event {
  topic: Topics.RequestCompleted;
  data: {
    requestId: string;
  };
}