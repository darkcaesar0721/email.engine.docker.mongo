import { OvhCheckRequested, Topics } from "../../../broker";
import { CheckResponse } from "../../../broker/validation-response";
import { config } from "../../../config";
import { logger } from "../../../logger";
import { ResultType } from "../../base-validator";
import { ovh } from "../../validators/ovh.validator";
import { CheckWorker } from "../check-worker";

export class OvhCheckWorker extends CheckWorker<OvhCheckRequested> {
  topic: OvhCheckRequested["topic"] = Topics.OvhCheckRequested;
  protected validationMethod: string = 'OVH';
  protected concurrency: number = config.CONCURRENCY.HTTP;
  protected maxJobLifeTime: number = config.MAX_JOB_LIFE_TIME.DEFAULT;

  onTimeout = async () => { }

  onWork = async (data: OvhCheckRequested["data"]): Promise<CheckResponse> => {
    try {
      const result = await ovh.validate(data.email);

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