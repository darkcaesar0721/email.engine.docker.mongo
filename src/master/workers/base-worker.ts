import { Worker } from 'bullmq';
import { Event } from '../../broker';

export abstract class BaseWorker<T extends Event> {
  protected abstract readonly topic: T['topic'];
  protected abstract concurrency: number;
  protected abstract onWork: (data: T['data']) => Promise<void>;
  private worker: Worker<T['data'], void, T['topic']> | undefined;
  constructor(protected connectionOption: { host: string; port: number }) {}

  async listen() {
    this.worker = new Worker<T['data'], void, T['topic']>(this.topic, async (job) => {
      await this.onWork(job.data);
    }, {
        connection: this.connectionOption,
        concurrency: this.concurrency,
      }
    );
    await this.worker.waitUntilReady();
    console.log('worker ready:', this.topic);
  }
  async close() {
    await this.worker?.close();
  }
}