import { Router } from 'express';
import { workers, REQUEST_ERRORS, sendRequest, REQUEST_TYPES } from '../master';

export const outlookCustomRouter = Router();

export interface OutlookCustomResponse {
	cookies: string[];
	flowToken: string;
	userAgent: string;
	correlationId: string;
}

outlookCustomRouter.post('/:id/open/outlookCustom', async (req, res) => {
	const { id } = req.params;

	if (workers.get(parseInt(id, 10))?.isReloadingTor) {
		res.status(430).json({ error: REQUEST_ERRORS.WORKER_RELOADING_TOR });
		return;
	}

	if (workers.get(parseInt(id, 10))?.isRestarting) {
		res.status(430).json({ error: REQUEST_ERRORS.WORKER_RESTARTING });
		return;
	}

	const { data, error } = await sendRequest(parseInt(id, 10), REQUEST_TYPES.OUTLOOK_CUSTOM, {
		url: req.body.url,
	});

	if (error) {
		if (error === REQUEST_ERRORS.CHROME_USAGE_LIMIT_EXCEEDED) {
			res.status(430).json({ error: error });
			return;
		}

		res.status(500).json({ error: error });
		return;
	}

	res.json(data);
});
