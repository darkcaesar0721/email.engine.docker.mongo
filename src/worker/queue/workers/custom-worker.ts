import { CustomVerificationRequestedEvent, Topics, VerificationFailedEvent } from "../../../broker";
import { ValidationResponse } from "../../../broker/validation-response";
import { config } from "../../../config";
import { logger } from "../../../logger";
import { Job } from "../../../models/job";
import { RequestDocument } from "../../../models/request";
import { greylist as blacklist } from "../../../services/greylist";
import { ResultType } from "../../base-validator";
import { ConcurrencyManager } from "../../concurrency-manager";
import { getBestMx } from "../../libs/smtp/dns/dns";
import { custom } from "../../validators";
import { BaseWorker } from "../base-worker";

const concurrencyManager = new ConcurrencyManager()

export class CustomWorker extends BaseWorker<CustomVerificationRequestedEvent> {
  protected validationMethod: string = 'CUSTOM';
  protected concurrency: number = config.CONCURRENCY.SMTP * 10 * 4;
  protected maxJobLifeTime: number = config.MAX_JOB_LIFE_TIME.DEFAULT;
  topic: CustomVerificationRequestedEvent["topic"] = Topics.CustomVerificationRequested;

  constructor(protected ip: string, protected connectionOption: { host: string, port: number }) {
    super(ip, connectionOption);
  }

  onTimeout = async () => {}

  onWork = async (data: CustomVerificationRequestedEvent["data"]): Promise<ValidationResponse> => {
    const { domain } = data;
    const blacklisted = await blacklist.contains({ ip: this.ip, provider: domain });

    if (blacklisted) {
      logger.trace({
        message: `bounce back because blacklisted`,
        ip: this.ip,
        domain
      });
      return { ...data, ip: this.ip, valid: false, reason: ResultType.BOUNCED, isSMTP: true };
    }

    const bestMx = await getBestMx(domain);

    if (!bestMx) {
      return {
        ...data,
        ip: this.ip,
        valid: false,
        reason: ResultType.NO_MX_RECORD,
        isSMTP: true,
        customValidationResult: {
          valid: false,
          mx: {
            valid: false,
            reason: ResultType.NO_MX_RECORD
          }
        }
      }
    }

    if (bestMx.exchange.toLowerCase().includes('google.com')) {
      logger.trace({
        message: `redirect to gmail`,
        ip: this.ip,
        domain
      })

      return {
        ...data,
        ip: this.ip,
        valid: false,
        redirect: 'gmail.com',
        reason: ResultType.REDIRECT,
        isSMTP: true,
      }
    }

    if (bestMx.exchange.toLowerCase().includes('outlook.com')) {
      logger.trace({
        message: `redirect to outlook`,
        ip: this.ip,
        domain
      })

      return {
        ...data,
        ip: this.ip,
        valid: false,
        redirect: 'outlook-custom.com',
        reason: ResultType.REDIRECT,
        isSMTP: true,
      }
    }

    if (bestMx.exchange.toLowerCase().includes('hotmail.com')) {
      logger.trace({
        message: `redirect to hotmail`,
        ip: this.ip,
        domain
      })

      return {
        ...data,
        ip: this.ip,
        valid: false,
        redirect: 'outlook-custom.com',
        reason: ResultType.REDIRECT,
        isSMTP: true,
      }
    }

    try {
      await concurrencyManager.enqueue(bestMx.exchange, data.id)
    } catch (e) {
      logger.trace({
        message: `bounce back because concurrency limit reached`,
        ip: this.ip,
        domain
      });
      return { ...data, ip: this.ip, valid: false, reason: ResultType.BOUNCED, isSMTP: true };
    }

    try {
      const { result, output, isSMTP } = await custom.validateCustom(data.email);
      const { validators, valid, messages, checks = {} } = output;
      const customValidationResult: VerificationFailedEvent['data']['customValidationResult'] = {
        ...validators,
        valid,
        smtp: {
          valid: validators.smtp?.valid || false,
          reason: validators.smtp?.reason,
          messages,
        }
      };

      concurrencyManager.dequeue(bestMx.exchange, data.id)

      if (result === ResultType.VALID || result === ResultType.INVALID || result === ResultType.CATCH_ALL) {
        logger.trace({ message: `producing finished result`, ip: this.ip, domain });
        return { ...data, ip: this.ip, valid: result === ResultType.VALID, reason: result, customValidationResult, isSMTP }
      }

      if (result === ResultType.BLACKLISTED) {
        const job = await Job.findById(data.id)
          .select({ request: 1})
          .populate('request', { completedCount: 1, totalCount: 1 });
        if (!job) {
          throw new Error(`job not found`);
        }
        if (!job.request) {
          throw new Error(`request not found`);
        }
        const request = job.request as RequestDocument;
        const completedPercentage = request.completedCount / request.totalCount;
        const minTTL = 30;
        const maxTTL = 5 * 60;
        const ttlRange = maxTTL - minTTL;
        // ttl should decrease when completed percentage increases
        const ttl = parseInt(`${Math.round(maxTTL - ttlRange * completedPercentage)}`, 10);
        console.log(`blacklist ttl ${ttl} with completed percentage ${completedPercentage} for ${domain}`);
        await blacklist.add({ ip: this.ip, provider: domain }, ttl);
      }

      return {
        ...data,
        ip: this.ip,
        valid: false,
        reason: result,
        checkHttp: {
          gmail: !!checks.gmail,
          outlook: !!checks.outlook,
          ovh: !!checks.ovh,
        },
        customValidationResult,
        isSMTP
      };
    } catch (e) {

      concurrencyManager.dequeue(bestMx.exchange, data.id)

      return {
        ...data,
        ip: this.ip,
        valid: false,
        reason: ResultType.CRASH,
        isSMTP: true,
      }
    }
  };
}