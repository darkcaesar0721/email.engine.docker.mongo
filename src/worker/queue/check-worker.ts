import { Job, Worker } from 'bullmq';
import { Event } from '../../broker';
import { logger } from '../../logger';
import { CheckResponse } from '../../broker/validation-response';

const timeout = (promise: Promise<CheckResponse>, ms: number): Promise<CheckResponse> => {
  // Create a promise that rejects in <ms> milliseconds
  const timeout: Promise<CheckResponse> = new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error('Timed out in ' + ms + 'ms.'));
    }, ms);
  });

  return Promise.race([promise, timeout]);
};

export abstract class CheckWorker<T extends Event> {
  protected abstract readonly topic: T['topic'];
  protected abstract concurrency: number;
  protected abstract maxJobLifeTime: number;
  protected abstract validationMethod: string;
  protected abstract onTimeout: () => Promise<void>
  protected abstract onWork: (data: T['data'], job: Job<T['data'], CheckResponse, T['topic']>) => Promise<CheckResponse>;
  private worker: Worker<T['data'], CheckResponse, T['topic']> | undefined;

  constructor(protected ip: string, protected connectionOption: { host: string; port: number }) { }

  async listen() {
    this.worker = new Worker<T['data'], CheckResponse, T['topic']>(
      this.topic,
      async (job) => {
        logger.trace({ message: `job received`, topic: this.topic, id: job.id });

        try {
          const result = await timeout(this.onWork(job.data, job), this.maxJobLifeTime);
          logger.trace({ message: `job completed`, topic: this.topic, id: job.id });


          return result
        } catch (e: any) {

          await this.onTimeout()

          logger.error({ message: `job crashed`, errorMessage: e.message, topic: this.topic, id: job.id });

          return {
            ...job.data,
            valid: false
          };
        }
      },
      {
        connection: this.connectionOption,
        concurrency: this.concurrency,
      }
    );
    await this.worker.waitUntilReady();
  }

  async close() {
    await this.worker?.close();
  }
}
