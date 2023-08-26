import { OutlookCustomVerificationRequestedEvent, Topics, VerificationFailedEvent } from '../../../broker';
import { ValidationResponse } from '../../../broker/validation-response';
import { config } from '../../../config';
import { logger } from '../../../logger';
import { ResultType } from '../../base-validator';
import { outlookCustom } from '../../validators';
import { BaseWorker } from '../base-worker';

export class OutlookCustomWorker extends BaseWorker<OutlookCustomVerificationRequestedEvent> {
	topic: OutlookCustomVerificationRequestedEvent['topic'] = Topics.OutlookCustomVerificationRequested;
	protected concurrency: number = config.CONCURRENCY.OUTLOOK;
	protected validationMethod: string = 'OUTLOOK_CUSTOM';
	protected maxJobLifeTime: number = config.MAX_JOB_LIFE_TIME.OUTLOOK;

	onTimeout = async () => {
		await outlookCustom.renewTorSession();
	};

	onWork = async (data: OutlookCustomVerificationRequestedEvent['data']): Promise<ValidationResponse> => {

    logger.trace({ message: `OutlookCustomWorker.onWork`, data });

		try {
			const result = await outlookCustom.validate(data.email);

      logger.trace({ message: `OutlookCustomWorker.onResult`, result });

			return {
				...data,
				ip: this.ip,
				valid: result === ResultType.VALID,
				reason: result,
				isSMTP: false,
			};
		} catch (e) {
			logger.error(e);

			return {
				...data,
				ip: this.ip,
				valid: false,
				reason: ResultType.CRASH,
				isSMTP: false,
			};
		}
	};
}
