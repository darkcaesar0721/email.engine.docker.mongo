import { OutlookCheckRequestedEvent, Topics } from "../../../broker";
import { CheckResponse } from "../../../broker/validation-response";
import { config } from "../../../config";
import { logger } from "../../../logger";
import { ResultType } from "../../base-validator";
import { outlookCustom } from "../../validators";
import { CheckWorker } from "../check-worker";

export class OutlookCheckWorker extends CheckWorker<OutlookCheckRequestedEvent> {
  topic: OutlookCheckRequestedEvent["topic"] = Topics.OutlookCheckRequested;
  protected validationMethod: string = 'OUTLOOK';
  protected concurrency: number = config.CONCURRENCY.OUTLOOK;
  protected maxJobLifeTime: number = config.MAX_JOB_LIFE_TIME.OUTLOOK;

  onTimeout = async () => { }

  onWork = async (data: OutlookCheckRequestedEvent["data"]): Promise<CheckResponse> => {
    try {
      const result = await outlookCustom.validate(data.email);

      return {
        ...data,
        valid: result === ResultType.VALID,
      };
    } catch (e) {

      logger.error(e);
      return {
        ...data,
        valid: false,
      };
    }
  };
}