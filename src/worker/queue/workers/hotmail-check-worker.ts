import {  HotmailSmtpCheckRequestedEvent, Topics } from "../../../broker";
import { CheckResponse } from "../../../broker/validation-response";
import { config } from "../../../config";
import { logger } from "../../../logger";
import { ResultType } from "../../base-validator";
import { custom } from "../../validators";
import { CheckWorker } from "../check-worker";

export class HotmailCheckWorker extends CheckWorker<HotmailSmtpCheckRequestedEvent> {
  topic: HotmailSmtpCheckRequestedEvent["topic"] = Topics.HotmailSmtpCheckRequested;
  protected validationMethod: string = 'OVH';
  protected concurrency: number = config.CONCURRENCY.HTTP;
  protected maxJobLifeTime: number = config.MAX_JOB_LIFE_TIME.DEFAULT;

  onTimeout = async () => { }

  onWork = async (data: HotmailSmtpCheckRequestedEvent["data"]): Promise<CheckResponse> => {
    try {
      const result = await custom.validateHotmail(data.email);

      return {
        ...data,
        valid: result === ResultType.VALID
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