import { GmailCheckRequestedEvent, Topics } from "../../../broker";
import { CheckResponse } from "../../../broker/validation-response";
import { config } from "../../../config";
import { logger } from "../../../logger";
import { ResultType } from "../../base-validator";
import { gmail } from "../../validators";
import { CheckWorker } from "../check-worker";

export class GmailCheckWorker extends CheckWorker<GmailCheckRequestedEvent> {
  topic: GmailCheckRequestedEvent["topic"] = Topics.GmailCheckRequested;
  protected validationMethod: string = 'GMAIL';
  protected concurrency: number = config.CONCURRENCY.GMAIL;
  protected maxJobLifeTime: number = config.MAX_JOB_LIFE_TIME.GMAIL;

  onTimeout = async () => { }

  onWork = async (data: GmailCheckRequestedEvent["data"]): Promise<CheckResponse> => {
    try {
      const result = await gmail.validate(data.email);

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