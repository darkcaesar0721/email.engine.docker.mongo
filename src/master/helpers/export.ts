import { CsvFormatterStream, format } from "@fast-csv/format";
import fs from "fs";
import { FilterQuery } from "mongoose";
import os from "os";
import { Job, JobDocument } from "../../models/job";
import { Request, RequestDocument } from "../../models/request";
import { roleBasedEmails } from "../../utils/role-based-emails";
import { ResultType } from "../../worker/base-validator";
import { convertReason } from "../routes/log";

interface ExportOption {
  requestId: string;
  reason?: string;
  resultType?: string;
}

function generateFilePath(opts: ExportOption): string {
  const items = [opts.requestId];
  if (opts.reason) {
    items.push(opts.reason);
  }
  if (opts.resultType) {
    items.push(opts.resultType);
  }
  return os.tmpdir() + '/' + items.join('-') + '.csv';
}

function generateHeaders(request: RequestDocument) {
  const headers = ['email', 'verificationResult', 'REASON'];
  for (let i = 0; i < (request.extraColumnCount || 0); i++) {
    headers.push(`extra-${i}`);
  }
  return headers;
}

function jobToRow(job: JobDocument, request: RequestDocument): { row: string[]; reason: string; resultType: string; } {
  const email = job.email.replace("\\r", '').replace("\\r", '').replace("\\r", '').replace("\\r", '').trim();
  let verificationResult: string | boolean | undefined = job.verificationResult;
  let reason: string | undefined = job.reason;
  if (job.reason === ResultType.CATCH_ALL.toString() || job.reason === ResultType.INBOX_FULL.toString()) {
    verificationResult = 'risky';
  } else if (verificationResult) {
    verificationResult = 'deliverable';
  } else {
    verificationResult = 'undeliverable';
  }
  const [prefix] = email.split('@');
  if (roleBasedEmails.includes(prefix)) {
    verificationResult = 'role'
  } 
  
  reason = convertReason(job.reason);

  const row = [
    email, 
    verificationResult,
    reason,
  ];
  if (request.hasExtra) {
    for (let i = 0; i < (request.extraColumnCount || 0); i++) {
      row.push(job.extra ? job.extra[i] : '');
    }
  }
  return {
    row,
    reason,
    resultType: verificationResult,
  }
}

export async function generateCSV(opts: ExportOption): Promise<string> {
  const file = generateFilePath(opts);

  if (fs.existsSync(file)) {
    return generateFilePath(opts);
  }

  const requestId = opts.requestId;
  const reason = opts.reason;
  const resultType = opts.resultType;
  const request = await Request.findById(requestId);
  if (!request) {
    throw new Error('request not found');
  }
  
  const outputStream = fs.createWriteStream(file);
  const headers = generateHeaders(request);
  const stream = format({ delimiter: ';', headers });
  stream.pipe(outputStream);

  const filter: FilterQuery<JobDocument> = { request: requestId };
  if (reason) {
    filter.reason = reason;
  }

  return new Promise((resolve, reject) => {
    Job.find(filter)
      .cursor()
      .on('end', () => {
        stream.end();
        resolve(file);
      })
      .on('error', (err) => {
        reject(err);
      })
      .on('data', (job: JobDocument) => {
        const row = jobToRow(job, request);
        if (resultType) {
          if (row.resultType === resultType) {
            stream.write(row);
          }
        } else {
          stream.write(row);
        }
      });
  });
};

export function generateAllExportOpts(requestId: string): ExportOption[] {
  return [{
    requestId,
  }, {
    requestId,
    reason: 'VALID',
  }, {
    requestId,
    reason: 'CATCH_ALL',
  }, {
    requestId,
    resultType: 'deliverable',
  }, {
    requestId,
    resultType: 'undeliverable',
  }, {
    requestId,
    resultType: 'risky',
  }]
}

type Store = {
  reason?: string;
  resultType?: string;
  stream: CsvFormatterStream<any, any>;
}[]

export async function generateAllCSV(requestId: string) {
  const request = await Request.findById(requestId);
  if (!request) {
    throw new Error('request not found');
  }
  const headers = generateHeaders(request);
  const options = generateAllExportOpts(requestId);
  const stores: Store = options.map((opts) => {
    const stream = format({ delimiter: ';', headers });
    stream.pipe(fs.createWriteStream(generateFilePath(opts)));
    return {
      reason: opts.reason,
      resultType: opts.resultType,
      stream,
    }
  });
  const filter: FilterQuery<JobDocument> = { request: requestId };
  return new Promise((resolve, reject) => {
    Job.find(filter)
      .cursor()
      .on('end', () => {
        stores.forEach((store) => {
          store.stream.end();
        });
        resolve(true);
      })
      .on('error', (err) => {
        reject(err);
      })
      .on('data', (job: JobDocument) => {
        const { row, reason, resultType } = jobToRow(job, request);
        stores.forEach((store) => {
          if (!store.reason && !store.resultType) {
            store.stream.write(row);
          } else if (
            store.reason && 
            store.reason === reason && 
            store.resultType && 
            store.resultType === resultType
          ) {
            store.stream.write(row);
          } else if (store.reason && store.reason === reason) {
            store.stream.write(row);
          } else if (store.resultType && store.resultType === resultType) {
            store.stream.write(row);
          }
        });
      });
  });
};