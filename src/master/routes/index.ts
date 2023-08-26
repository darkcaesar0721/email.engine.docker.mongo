import { Router } from 'express'
import { uploadRouter } from './upload';
import { verifyRouter } from './verify'
import { statRouter } from './stat'
import { retryRouter } from './retry';
import { reportsRouter } from './report';
import { jobsRouter } from './jobs';
import { pauseRouter } from './pause';
import { resumeRouter } from './resume';
import { progressRouter } from './progress';
import { requestsRouter } from './requests';
import { loginRouter } from './login';
import { chartsRouter } from './charts';
import { workersRouter } from './workers';
import { logsRouter } from './log';
import { removeRouter } from './remove'
import { reloadRouter } from './reload';

export const router = Router();

router.use(verifyRouter);
router.use(uploadRouter);
router.use(statRouter);
router.use(retryRouter);
router.use(reportsRouter);
router.use(jobsRouter);
router.use(pauseRouter);
router.use(resumeRouter);
router.use(progressRouter);
router.use(requestsRouter);
router.use(loginRouter);
router.use(chartsRouter);
router.use(workersRouter);
router.use(logsRouter);
router.use(removeRouter);
router.use(reloadRouter)