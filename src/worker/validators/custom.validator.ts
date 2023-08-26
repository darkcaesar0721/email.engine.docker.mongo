import { config } from '../../config';
import { logger } from '../../logger';

import { makeRandomEmail } from '../../utils/mock';
import { BaseValidator, ResultType } from '../base-validator';
import { validate } from '../libs/smtp';
import { getBestMx } from '../libs/smtp/dns/dns';
import { OutputFormat } from '../libs/smtp/output/output';


const validateOption = {
  validateRegex: true,
  validateMx: true,
  validateTypo: true,
  validateDisposable: true,
  validateSMTP: true,
};

const sender = 'ephoto.dev@gmail.com';

class CustomValidator extends BaseValidator {
  protected getCookieUrl = '';

  async validate(email: string): Promise<ResultType> {
    throw new Error('Method not implemented.');
  }

  async validateHotmail(email: string): Promise<ResultType> {
    const [, domain] = email.split('@');

    const bestMx = await getBestMx(domain);

    if (!bestMx) {
      return ResultType.NO_MX_RECORD
    }

    const result = await validate({ ...validateOption, email, sender });

    const { validators } = result;
    const { smtp, mx } = validators;

    if (!mx?.valid) {
      return ResultType.NO_MX_RECORD;
    }

    if (!smtp?.valid) {
      if (result.invalid) {
        return ResultType.INVALID;
      }

      if (result.timeout) {
        return ResultType.TIMEOUT;
      }

      if (result.reason === "SMTP connection timed out.") {
        return ResultType.TIMEOUT;
      }

      if (result.messages?.includes("failed: SMTP connection timed out.")) {
        return ResultType.TIMEOUT;
      }

      if (result.validators?.smtp?.reason === "SMTP connection timed out.") {
        return ResultType.TIMEOUT;
      }

      if (result.validators?.smtp?.messages?.includes("failed: SMTP connection timed out.")) {
        return ResultType.TIMEOUT;
      }
    }

    return ResultType.VALID;
  }

  async validateCustom(email: string): Promise<{
    result: ResultType; output: OutputFormat, checks?: {
      gmail?: boolean,
      outlook?: boolean,
      ovh?: boolean,
    }, isSMTP: boolean
  }> {
    logger.trace({ message: 'Validating email', email, validator: 'custom' });

    const [, domain] = email.split('@');

    const bestMx = await getBestMx(domain);

    if (!bestMx) {
      return {
        result: ResultType.NO_MX_RECORD,
        output: {
          valid: false,
          validators: {
            mx: {
              valid: false,
              reason: 'MX record not found'
            }
          },
          reason: 'MX record not found'
        },
        isSMTP: true
      };
    }


    const checks = {
      gmail: false,
      outlook: false,
      ovh: false,
    }

    const result = await validate({ ...validateOption, email, sender });

    const { validators } = result;
    const { smtp, mx, disposable } = validators;

    if (!mx?.valid || !disposable?.valid) {
      return { result: ResultType.INVALID, output: result, isSMTP: true };
    }
    if (!smtp?.valid) {

      if (result.invalid) {
        return { result: ResultType.INVALID, output: result, isSMTP: true };
      }

      if (result.inboxfull) {
        return { result: ResultType.INBOX_FULL, output: result, isSMTP: true };
      }

      if (result.blacklist) {
        return { result: ResultType.BLACKLISTED, output: result, isSMTP: true };
      }

      if (result.greylist) {
        return { result: ResultType.GREYLISTED, output: result, isSMTP: true };
      }

      if (result.catchall) {
        return { result: ResultType.CATCH_ALL, output: result, isSMTP: true };
      }

      if (result.timeout) {
        result.validators = result.validators || {};
        result.validators.smtp = { valid: false, reason: ResultType.TIMEOUT };
        result.reason = ResultType.TIMEOUT;
        return { result: ResultType.TIMEOUT, output: result, isSMTP: true };
      }



      if (result.reason === "SMTP connection timed out.") {
        return { result: ResultType.TIMEOUT, output: result, isSMTP: true };
      }

      if (result.messages?.includes("failed: SMTP connection timed out.")) {
        return { result: ResultType.TIMEOUT, output: result, isSMTP: true };
      }

      if (result.validators?.smtp?.reason === "SMTP connection timed out.") {
        return { result: ResultType.TIMEOUT, output: result, isSMTP: true };
      }

      if (result.validators?.smtp?.messages?.includes("failed: SMTP connection timed out.")) {
        return { result: ResultType.TIMEOUT, output: result, isSMTP: true };
      }

      return { result: ResultType.UNKNOWN, output: result, isSMTP: true };
    }

    const catchAllResult = await Promise.all(
      Array.from(Array(config.CATCHALL_VALIDATION_COUNT)).map(async () => {
        const randomEmail = makeRandomEmail(domain);
        logger.info({ randomEmail });
        const {
          validators: { smtp },
        } = await validate({ ...validateOption, email: randomEmail, sender });
        return smtp?.valid;
      })
    );

    logger.info({ catchAllResult });
    const catchAllValidCount = catchAllResult.filter((v) => v).filter(Boolean).length;

    if (catchAllValidCount === config.CATCHALL_VALIDATION_COUNT) {
      checks.gmail = true;
      checks.outlook = true;

      if (bestMx.exchange.includes('ovh.net')) {
        checks.ovh = true;
      }

      return { result: ResultType.CATCH_ALL, output: result, checks, isSMTP: true };
    }
    return { result: ResultType.VALID, output: result, checks, isSMTP: true };
  }
}

export const custom = new CustomValidator();