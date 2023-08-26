import { Request, Router } from 'express';
import { Request as RequestCollection } from '../../models/request';
import { Job as JobCollection, JobStatus } from '../../models/job';
import { Types } from 'mongoose';
import { getQueue, produceRequestCompleted } from '../helpers/producer';
import { auth } from '../middlewares/auth';

export const reloadRouter = Router();

async function pauseJob(jobId: string, email: string) {
	console.log('Pausing job', jobId);
	const { queue } = getQueue(email);
	const removed = await queue.remove(jobId);
	if (removed === 1) {
		console.log('Job removed from queue', jobId);
	} else {
		console.log('Job not removed from queue', jobId);
	}
}

reloadRouter.post('/reload/:requestId', auth, async (req: Request, res) => {
	const requestId = new Types.ObjectId(req.params.requestId);

	const request = await RequestCollection.findById(requestId);

	if (!request) {
		return res.status(404).send('request not found');
	}

	if (request.completedCount >= request.totalCount) {
		return res.status(400).send('request already completed');
	}

	const jobs = await JobCollection.find({
		request: requestId,
		status: { $ne: JobStatus.COMPLETED },
	}).select({
		_id: 1,
		email: 1,
	});

	await Promise.all(jobs.map(({ id, email }) => pauseJob(id, email)));

	await JobCollection.updateMany(
		{
			_id: { $in: jobs.map(({ id }) => id) },
		},
		{
			$set: {
				status: JobStatus.COMPLETED,
			},
		}
	);

	request.set({
		completedCount: request.totalCount,
	});

	await produceRequestCompleted(request._id.toString());
	await request.save();
});
