import { Router } from 'express';
import { aolRouter } from './aol';
import { outlookRouter } from './outlook';
import { outlookCustomRouter } from './outlookCustom';
import { yahooRouter } from './yahoo';
import { fetchRouter } from './fetch';
import { torRouter } from './renewTor';

export const router = Router();

router.use(aolRouter);
router.use(outlookCustomRouter);
router.use(outlookRouter);
router.use(yahooRouter);
router.use(fetchRouter);
router.use(torRouter);
