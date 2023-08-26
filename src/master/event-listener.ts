import { QueueEvents } from 'bullmq';
import { Topics } from '../broker';
import { CheckResponse, ValidationResponse } from '../broker/validation-response';
import { config } from '../config';
import { logger } from '../logger';
import { Job, JobStatus } from '../models/job';
import { jobCanTryAgain } from '../services/job';
import { ResultType } from '../worker/base-validator';
import { produceGmailCheckRequest, produceHotmailSmtpCheckRequest, produceOutlookCheckRequest, produceOvhCheckRequest, produceRequestCompleted, produceVerificationRequest } from './helpers/producer';

const queueOption = {
	connection: {
		host: config.REDIS_HOST,
		port: config.REDIS_PORT,
	},
};

const HTTP_RETRIABLES = [ResultType.CRASH, ResultType.TIMEOUT, ResultType.UNKNOWN, ResultType.INVALID_VENDOR, ResultType.ANTI_SPAM];

async function onCompleted(jobId: string, response: ValidationResponse) {
	let attemptData = {
		validatedRelay: response.validatedRelay,
		validatedWorker: response.validatedWorker,
		validationTime: response.validationTime,
		validationMethod: response.validationMethod,
	};

	switch (response.reason) {
		case ResultType.VALID:
		case ResultType.INVALID:
		case ResultType.CATCH_ALL:
		case ResultType.INBOX_FULL:
		case ResultType.NO_MX_RECORD:
			if (response.checkHttp?.gmail) {
				await checkGmail(jobId, response);
			}

			if (response.checkHttp?.outlook) {
				await checkOutlook(jobId, response);
			}

			if (response.checkHttp?.ovh) {
				await checkOvh(jobId, response);
			}

			if (response.checkSmtp?.hotmail) {
				await checkHotmail(jobId, response);
			}

			const completionResult = await Job.completed(jobId, response.valid, response.ip, response.reason, response.customValidationResult, attemptData);
			const {
				request: { id: requestId, totalCount, completedCount },
			} = completionResult;
			// console.log(requestId, "completedCount:", completedCount, "totalCount:", totalCount);
			if (completedCount >= totalCount) {
				// console.log("request completed", requestId);
				await produceRequestCompleted(requestId);
			}
			break;
		case ResultType.REDIRECT:
			logger.info({ message: `Redirected`, response });
			await redirectJob(jobId, response);
			await retryJob(jobId, response, true);
			break;
		case ResultType.BOUNCED:
			logger.info({ message: `Bounced`, response });
			await retryJob(jobId, response, false, true);
			break;
		default: {
			await Job.failed(jobId, response.reason, response.ip, response.customValidationResult, attemptData);
			if (response.isSMTP) {
				await retryJob(jobId, response, true);
			} else if (HTTP_RETRIABLES.includes(response.reason)) {
				await retryJob(jobId, response, true);
			}
			break;
		}
	}
}

async function onCheckValid(jobId: string) {
	await Job.updateOne(
		{ _id: jobId },
		{
			$set: {
				status: JobStatus.COMPLETED,
				verificationResult: true,
				reason: ResultType.VALID,
			},
		}
	);
}

async function checkGmail(jobId: string, response: ValidationResponse) {
	await produceGmailCheckRequest(jobId, response.email, true, 0);
}

async function checkOutlook(jobId: string, response: ValidationResponse) {
	await produceOutlookCheckRequest(jobId, response.email, true, 0);
}

async function checkOvh(jobId: string, response: ValidationResponse) {
	await produceOvhCheckRequest(jobId, response.email, true, 0);
}

async function checkHotmail(jobId: string, response: ValidationResponse) {
	await produceHotmailSmtpCheckRequest(jobId, response.email, true, 0);
}

async function redirectJob(jobId: string, response: ValidationResponse) {
	if (!response.redirect) {
		return;
	}

	await Job.updateOne(
		{ _id: jobId },
		{
			$set: {
				validator: response.redirect,
			},
		}
	);
}

async function retryJob(jobId: string, response: ValidationResponse, checkCanTry: boolean = false, bounced: boolean = false) {
	let attemptData = {
		validatedRelay: response.validatedRelay,
		validatedWorker: response.validatedWorker,
		validationTime: response.validationTime,
		validationMethod: response.validationMethod,
	};

	let canTry = true;
	let validator: string | undefined = undefined;

	if (checkCanTry) {
		const job = await Job.findById(jobId).lean();

		if (!job) {
			canTry = false;
		} else {
			if (job.validator) {
				validator = job.validator;
			}
			canTry = jobCanTryAgain(job, response.isSMTP);
		}
	}
	if (canTry) {
		logger.trace({ message: `retrying verification in ${config.JOB_RETRY_DELAY}`, response });
		await produceVerificationRequest({
			id: jobId,
			email: response.email,
			checkPaused: true,
			delayInMilliseconds: bounced ? config.BOUNCE_RETRY_DELAY : config.JOB_RETRY_DELAY,
			validator,
		});
	} else {
		const completionResult = await Job.completed(jobId, response.valid, response.ip, response.reason, response.customValidationResult, attemptData);
		const {
			request: { id: requestId, totalCount, completedCount },
		} = completionResult;
		// console.log(requestId, 'completedCount:', completedCount, 'totalCount:', totalCount);
		if (completedCount >= totalCount) {
			// console.log('request completed', requestId);
			await produceRequestCompleted(requestId);
		}
	}
}

async function onFailed(jobId: string, reason: string) {
	logger.error({ message: `job failed`, jobId, reason });
	await Job.failed(jobId, reason, 'unknown ip', undefined, {});
	const job = await Job.findById(jobId).lean();

	let validator: string | undefined = undefined;

	if (!job) {
		return;
	}

	if (job.validator) {
		validator = job.validator;
	}

	const canTry = jobCanTryAgain(job, false);
	if (canTry) {
		await produceVerificationRequest({ id: jobId, email: job.email, checkPaused: true, delayInMilliseconds: config.JOB_RETRY_DELAY, validator });
	}
}

export async function listenCheckEvents() {
	const topics = [Topics.GmailCheckRequested, Topics.OutlookCheckRequested, Topics.OvhCheckRequested];

	topics.forEach((topic) => {
		const event = new QueueEvents(topic, queueOption);
		event.on('completed', async ({ jobId, returnvalue }) => {
			const response = returnvalue as unknown as CheckResponse;
			if (response.valid) {
				await onCheckValid(jobId);
			}
		});
	});
}

export async function listenSmtpCheckEvents() {
	const topics = [Topics.HotmailSmtpCheckRequested];

	topics.forEach((topic) => {
		const event = new QueueEvents(topic, queueOption);
		event.on('completed', async ({ jobId, returnvalue }) => {
			const response = returnvalue as unknown as CheckResponse;
			if (!response.valid) {
				await Job.updateOne(
					{ _id: jobId },
					{
						$set: {
							status: JobStatus.COMPLETED,
							verificationResult: false,
							reason: ResultType.INVALID,
						},
					}
				);
			}
		});
	});
}

export async function listenJobEvents() {
	const topics = [
		Topics.AolVerificationRequested,
		Topics.CustomVerificationRequested,
		Topics.GmailVerificationRequested,
		Topics.OutlookVerificationRequested,
		Topics.YahooVerificationRequested,
		Topics.SkynetVerificationRequested,
		Topics.MailruVerificationRequested,
		Topics.OutlookCustomVerificationRequested,
	];
	topics.forEach((topic) => {
		const event = new QueueEvents(topic, queueOption);
		event.on('completed', async ({ jobId, returnvalue }) => {
			const response = returnvalue as unknown as ValidationResponse;
			await onCompleted(jobId, response);
		});
		event.on('failed', async ({ jobId, failedReason }) => {
			logger.error({ message: `job failed`, topic, jobId, failedReason });
			await onFailed(jobId, failedReason);
		});
		event.on('stalled', async ({ jobId }) => {
			logger.error({ message: `job stalled`, topic, jobId });

			await onFailed(jobId, 'stalled');
		});
	});
}
