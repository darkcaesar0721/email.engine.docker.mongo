import { AolVerificationRequestedEvent, CustomVerificationRequestedEvent, GmailVerificationRequestedEvent, MailruVerificationRequestedEvent, MailVerificationRequestedEvent, OutlookCustomVerificationRequestedEvent, OutlookVerificationRequestedEvent, RequestCompletedEvent, SkynetVerificationRequestedEvent, Topics, YahooVerificationRequestedEvent } from "../../broker";
import { JobsOptions, Queue } from "bullmq";
import { config } from "../../config";
import { isHotmail, isMsn, isOutlook, isSkynet, isYahoo } from "./domain";
import { Job as JobCollection } from "../../models/job";
import { RequestDocument } from "../../models/request";
import { GmailCheckRequestedEvent } from "../../broker/events/GmailCheckRequestedEvent";
import { OutlookCheckRequestedEvent } from "../../broker/events/OutlookCheckRequestedEvent";
import { OvhCheckRequested } from "../../broker/events/OvhCheckRequestedEvent";
import { HotmailSmtpCheckRequestedEvent } from "../../broker/events/HotmailSmtpCheckRequestedEvent";
import { logger } from "../../logger";

interface VerificationProducers {
  [key: string]: Queue<MailVerificationRequestedEvent['data'], void, string>;
}

const queueOption = {
  connection: {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
  }
}

const requestCompletedQueue = new Queue<RequestCompletedEvent['data'], void, RequestCompletedEvent['topic']>(Topics.RequestCompleted, queueOption);

export const customVerificationQueue = new Queue<CustomVerificationRequestedEvent['data'], void, CustomVerificationRequestedEvent['topic']>(Topics.CustomVerificationRequested, queueOption);
const mailruQueue = new Queue<MailruVerificationRequestedEvent['data'], void, MailruVerificationRequestedEvent['topic']>(Topics.MailruVerificationRequested, queueOption);
const outlookQueue = new Queue<OutlookVerificationRequestedEvent['data'], void, OutlookVerificationRequestedEvent['topic']>(Topics.OutlookVerificationRequested, queueOption);
const yahooQueue = new Queue<YahooVerificationRequestedEvent['data'], void, YahooVerificationRequestedEvent['topic']>(Topics.YahooVerificationRequested, queueOption);
const skynetQueue = new Queue<SkynetVerificationRequestedEvent['data'], void, SkynetVerificationRequestedEvent['topic']>(Topics.SkynetVerificationRequested, queueOption);

export const gmailCheckQueue = new Queue<GmailCheckRequestedEvent['data'], void, GmailCheckRequestedEvent['topic']>(Topics.GmailCheckRequested, queueOption);
export const outlookCheckQueue = new Queue<OutlookCheckRequestedEvent['data'], void, OutlookCheckRequestedEvent['topic']>(Topics.OutlookCheckRequested, queueOption);
export const outlookCustomQueue = new Queue<OutlookCustomVerificationRequestedEvent['data'], void, OutlookCustomVerificationRequestedEvent['topic']>(Topics.OutlookCustomVerificationRequested, queueOption);
export const ovhCheckQueue = new Queue<OvhCheckRequested['data'], void, OvhCheckRequested['topic']>(Topics.OvhCheckRequested, queueOption);
export const hotmailSmtpCheckQueue = new Queue<HotmailSmtpCheckRequestedEvent['data'], void, HotmailSmtpCheckRequestedEvent['topic']>(Topics.HotmailSmtpCheckRequested, queueOption);

export const queues: VerificationProducers = {
  'aol.com': new Queue<AolVerificationRequestedEvent['data'], void, AolVerificationRequestedEvent['topic']>(Topics.AolVerificationRequested, queueOption),
  'gmail.com': new Queue<GmailVerificationRequestedEvent['data'], void, GmailVerificationRequestedEvent['topic']>(Topics.GmailVerificationRequested, queueOption),

  // yahoo
  'yahoo.com': yahooQueue,
  'ymail.com': yahooQueue,
  // outlook
  'outlook-custom.com': outlookCustomQueue,
  'outlook.com': outlookQueue,
  'hotmail.com': outlookQueue,
  'hotmail.co.uk': outlookQueue,
  'hotmail.fr': outlookQueue,
  'live.com': outlookQueue,
  'msn.com': outlookQueue,
  'windowslive.com': outlookQueue,
  // mairu
  'mail.ru': mailruQueue,
  'inbox.ru': mailruQueue,
  'list.ru': mailruQueue,
  'bk.ru': mailruQueue,
  'internet.ru': mailruQueue,
}

interface Workers {
  [key: string]: {
    workers: string[];
    count: number;
  };
}

export async function getTotalWorkers() {
  const totalWorkers = await Promise.all(Object.values(queues).map(queue => queue.getWorkers()));
  const workers: Workers = {};
  totalWorkers.forEach((workerList) => {
    workerList.forEach((worker) => {
      workers[worker.name] = workers[worker.name] || { workers: [], count: 0 };
      workers[worker.name].workers.push(worker.addr);
    });
  });
  Object.values(workers).forEach((worker) => {
    worker.count = worker.workers.length;
  });
  return workers;
}

export async function drainQueues() {
  await customVerificationQueue.drain();
  await Promise.all(Object.values(queues).map(queue => queue.drain()));
}

export function getQueueByDomain(domain: string) {
  const queue = queues[domain];
  if (queue) {
    return queue;
  }

  if (isYahoo(domain)) {
    return yahooQueue;
  }

  if (isSkynet(domain)) {
    return skynetQueue;
  }

  if (isHotmail(domain)) {
    return outlookQueue;
  }

  if (isOutlook(domain)) {
    return outlookQueue;
  }

  if (isMsn(domain)) {
    return outlookQueue;
  }

  return customVerificationQueue;
}

export function getQueue(_email: string) {
  const email = _email.replace("\\r", '').replace("\\r", '').replace("\\r", '').replace("\\r", '').trim();
  const domain = email.split('@')[1].trim().toLowerCase();
  const queue = getQueueByDomain(domain);
  return { queue, domain };
}

export async function produceVerificationRequest({
  id,
  email,
  checkPaused,
  delayInMilliseconds,
  hasPriority,
  validator
}: {
  id: string;
  email: string;
  checkPaused: boolean;
  delayInMilliseconds?: number;
  hasPriority?: boolean;
  validator?: string;
}) {
  if (checkPaused) {
    const job = await JobCollection.findById(id).populate('request', { paused: 1 });
    if ((job?.request as RequestDocument).paused) {
      return;
    }
  }

  let queue: Queue<MailVerificationRequestedEvent['data'], void, string>;
  const domain = email.split('@')[1].trim().toLowerCase();

  if (validator && queues[validator]) {
    queue = queues[validator];
  } else {
    const { queue: _queue } = getQueue(email);
    queue = _queue;
  }

  const jobOption: JobsOptions = { jobId: id, removeOnComplete: true, removeOnFail: true };
  if (delayInMilliseconds) {
    jobOption.delay = delayInMilliseconds;
  }

  if (hasPriority) {
    jobOption.priority = 1;
  } else {
    jobOption.priority = Math.ceil(Math.random() * 10);
  }

  logger.info({
    queue: queue.name,
    id,
    email,
    domain
  })

  const job = await queue.add(id, { id, email, domain }, jobOption);

  return job
}

export async function produceGmailCheckRequest(id: string, email: string, checkPaused: boolean, delayInMilliseconds?: number) {
  if (checkPaused) {
    const job = await JobCollection.findById(id).populate('request', { paused: 1 });
    if ((job?.request as RequestDocument).paused) {
      return;
    }
  }
  const jobOption: JobsOptions = { jobId: id, removeOnComplete: true, removeOnFail: true };

  if (delayInMilliseconds) {
    jobOption.delay = delayInMilliseconds;
  }

  return gmailCheckQueue.add(Topics.GmailCheckRequested, { id, email, domain: 'gmail.com' }, jobOption);
}

export async function produceOutlookCheckRequest(id: string, email: string, checkPaused: boolean, delayInMilliseconds?: number) {
  if (checkPaused) {
    const job = await JobCollection.findById(id).populate('request', { paused: 1 });
    if ((job?.request as RequestDocument).paused) {
      return;
    }
  }
  const jobOption: JobsOptions = { jobId: id, removeOnComplete: true, removeOnFail: true };

  if (delayInMilliseconds) {
    jobOption.delay = delayInMilliseconds;
  }

  return outlookCheckQueue.add(Topics.OutlookCheckRequested, { id, email, domain: 'outlook.com' }, jobOption);
}

export async function produceOvhCheckRequest(id: string, email: string, checkPaused: boolean, delayInMilliseconds?: number) {
  if (checkPaused) {
    const job = await JobCollection.findById(id).populate('request', { paused: 1 });
    if ((job?.request as RequestDocument).paused) {
      return;
    }
  }
  const jobOption: JobsOptions = { jobId: id, removeOnComplete: true, removeOnFail: true };

  if (delayInMilliseconds) {
    jobOption.delay = delayInMilliseconds;
  }

  return ovhCheckQueue.add(Topics.OvhCheckRequested, { id, email, domain: 'ovh.com' }, jobOption);
}

export async function produceHotmailSmtpCheckRequest(id: string, email: string, checkPaused: boolean, delayInMilliseconds?: number) {
  if (checkPaused) {
    const job = await JobCollection.findById(id).populate('request', { paused: 1 });
    if ((job?.request as RequestDocument).paused) {
      return;
    }
  }
  const jobOption: JobsOptions = { jobId: id, removeOnComplete: true, removeOnFail: true };

  if (delayInMilliseconds) {
    jobOption.delay = delayInMilliseconds;
  }

  return hotmailSmtpCheckQueue.add(Topics.HotmailSmtpCheckRequested, { id, email, domain: 'hotmail.com' }, jobOption);
}

export async function produceRequestCompleted(requestId: string) {
  return requestCompletedQueue.add(Topics.RequestCompleted, { requestId }, { jobId: requestId });
}