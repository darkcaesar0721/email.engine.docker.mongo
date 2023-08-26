import { RequestCompletedEvent, Topics } from "../../broker";
import { config } from "../../config";
import { generateAllCSV } from "../helpers/export";
import { BaseWorker } from "./base-worker";

class RequestCompletedWorker extends BaseWorker<RequestCompletedEvent> {
  protected topic: RequestCompletedEvent['topic'] = Topics.RequestCompleted;
  protected concurrency: number = 2;
  onWork = async (data: RequestCompletedEvent['data']): Promise<void> => {
    console.log("RequestCompletedWorker.onWork", data.requestId);
    await generateAllCSV(data.requestId);
    console.log("RequestCompletedWorker.onWork done");
  }
}

export const requestCompletedWorker = new RequestCompletedWorker({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
});