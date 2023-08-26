import { Job } from 'bullmq';
import { Request, Router } from 'express';
import { Job as JobCollection, JobStatus } from '../../models/job';
import { Request as RequestCollection } from '../../models/request';
import { getQueue } from '../helpers/producer';
import { auth } from '../middlewares/auth';

async function removeJob(jobId: string, email: string) {
	console.log('Removing job', jobId);
	const { queue } = getQueue(email);
	const removed = await queue.remove(jobId);
	if (removed === 1) {
		console.log('Job removed from queue', jobId);
	} else {
		console.log('Job not removed from queue', jobId);
	}
}

export const removeRouter = Router();

removeRouter.post('/requests/:requestId/remove', auth, async (req: Request, res) => {
	const { requestId } = req.params;
	const request = await RequestCollection.findById(requestId);
	if (!request) {
		return res.status(404).send('Request not found');
	}

	const jobs = await JobCollection.find({
		request: requestId,
	}).select({ _id: 1, email: 1 });

	console.log(
		'Removing jobs',
		jobs.map(({ id }) => id)
	);
  
	await Promise.all(jobs.map(({ id, email }) => removeJob(id, email)));

  await JobCollection.deleteMany({
    request: requestId,
  })

	await request.remove();
	res.json({ success: true });
});
