import { LeanDocument, Types } from 'mongoose';
import { config } from '../config';
import { Job, JobDocument, JobStatus } from '../models/job';
import { redis } from '../utils/redis';

export function jobCanTryAgain(
	job: LeanDocument<(JobDocument & {
		_id: Types.ObjectId;
	})>,
	isSMTP: boolean
): boolean {
	// const key = `job:${jobId}:tries`
	// const triedCount = await redis.client.incr(key);
	// await redis.client.expire(key, 60 * 5);
	const maxTries = isSMTP ? config.SMTP_JOB_MAX_TRY : config.HTTP_JOB_MAX_TRY;
	// return triedCount < maxTries;
	// const job = await Job.findById(jobId).select({ status: 1, attemptCount: 1 });
	// if (!job) {
	//   return false;
	// }

	if (job.status === JobStatus.COMPLETED) {
		return false;
	}

	const attemptCount = job.attemptCount || 0;
	return attemptCount < maxTries;
}
