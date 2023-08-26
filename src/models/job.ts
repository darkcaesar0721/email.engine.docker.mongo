import mongoose, { Document, Model, Schema } from 'mongoose';
import { ResultType } from '../worker/base-validator';
import { Request, RequestDocument } from './request';

export enum JobStatus {
  REQUESTED = 'REQUESTED',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED',
}

const statuses = Object.values(JobStatus);

interface AttemptData {
  validatedRelay: string;
  validatedWorker: string;
  validationTime: number;
  validationMethod: string;
}

interface CustomValidationResult {
  valid: boolean;
  regex?: {
    valid: boolean;
    reason?: string;
  };
  typo?: {
    valid: boolean;
    reason?: string;
  };
  disposable?: {
    valid: boolean;
    reason?: string;
  };
  mx?: {
    valid: boolean;
    reason?: string;
  };
  smtp?: {
    valid: boolean;
    reason?: string;
    messages?: string[];
  };
}

export interface JobProps {
  request: RequestDocument | string;
  email: string;
  status: JobStatus;
  verificationResult?: boolean;
  error?: string;
  reason?: string;
  attemptCount?: number;
  validator?: string;
  attempts?: {
    ip: string;
    date: Date;
    reason?: ResultType;
    validatedRelay?: string,
    validatedWorker?: string,
    validationTime?: number,
    validationMethod?: string,
    customValidationResult?: CustomValidationResult;
  }[],
  extra?: {
    [key: string]: string;
  },
}

export interface JobDocument extends JobProps, Document {
  createdAt: Date;
  updatedAt: Date;
}

interface JobModel extends Model<JobDocument> {
  build(props: JobProps): JobDocument;
  completed(id: string, verificationResult: boolean, ip: string, reason: string, customValidationResult: CustomValidationResult | undefined, attemptData: Partial<AttemptData>): Promise<{ request: { id: string; completedCount: number; totalCount: number; }}>;
  failed(id: string, error: string, ip: string, customValidationResult: CustomValidationResult | undefined, attemptData: Partial<AttemptData>): Promise<JobDocument>;
  checkRequestCompleted(jobId: string): Promise<{
    requestId: string;
    completed: boolean;
  }>;
}

const JobSchema = new Schema<JobDocument, JobModel>(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
    },
    email: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: statuses,
    },
    verificationResult: {
      type: Boolean,
    },
    error: {
      type: String,
    },
    reason: {
      type: String,
    },
    validator: {
      type: String,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    attempts: [
      {
        ip: {
          type: String,
          required: true,
        },
        date: {
          type: Date,
          required: true,
        },
        reason: {
          type: String,
          required: true,
        },
        validatedRelay: {
          type: String,
        },
        validatedWorker: {
          type: String,
        },
        validationTime: {
          type: Number,
        },
        validationMethod: {
          type: String,
        },
        customValidationResult: {
          valid: {
            type: Boolean,
            required: true,
          },
          regex: {
            valid: Boolean,
            reason: String,
          },
          typo: {
            valid: Boolean,
            reason: String,
          },
          disposable: {
            valid: Boolean,
            reason: String,
          },
          mx: {
            valid: Boolean,
            reason: String,
          },
          smtp: {
            valid: Boolean,
            reason: String,
            messages: [String],
          },
        },
      }
    ],
    extra: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

JobSchema.statics.build = (props: JobProps) => {
  return new Job(props);
}

JobSchema.statics.completed = async (id: string, verificationResult: boolean, ip: string, reason: string, customValidationResult: CustomValidationResult | undefined, attemptData?: AttemptData) => {
  const job = await Job.findById(id).select({ status: 1, request: 1 });
  if (!job) {
    throw new Error('Job not found');
  }
  let fixedCustomValidationResult: CustomValidationResult | undefined;
  if (customValidationResult) {
    fixedCustomValidationResult = {
      ...customValidationResult,
    };
    if (customValidationResult.smtp) {
      fixedCustomValidationResult.smtp = {
        ...customValidationResult.smtp,
      };
      if (customValidationResult.smtp.reason) {
        fixedCustomValidationResult.smtp.reason = customValidationResult.smtp.reason.toString();
      }
    }
  }

  if (job.status === JobStatus.COMPLETED) {
    const request = await Request.findById(job.request);

    if (!request) {
      throw new Error('Request not found');
    }

    return {
      request: {
        id: request.id,
        completedCount: request.completedCount,
        totalCount: request.totalCount,
      }
    }
  }

  const updatedRequest = await Request.incrementCompletedCount(job.request.toString());
  await Job.updateOne({
    _id: id,
    status: {
      $ne: JobStatus.COMPLETED
    }
  }, {
    $set: {
      status: JobStatus.COMPLETED,
      verificationResult,
      reason: reason,
    },
    $inc: {
      attemptCount: 1
    },
    $push: {
      attempts: {
        ip,
        date: new Date(),
        customValidationResult: fixedCustomValidationResult,
        reason,
        ...attemptData || {},
      }
    }
  });
  return {
    request: {
      id: updatedRequest.id,
      completedCount: updatedRequest.completedCount,
      totalCount: updatedRequest.totalCount,
    }
  }
}

JobSchema.statics.failed = async (id: string, error: string, ip: string, customValidationResult: CustomValidationResult | undefined, attemptData?: AttemptData) => {
  let customResult: CustomValidationResult | undefined;
  if (customValidationResult) {
    customResult = {
      ...customValidationResult,
    };
    if (customValidationResult.smtp) {
      customResult.smtp = {
        ...customValidationResult.smtp,
      };
      if (customValidationResult.smtp.reason) {
        customResult.smtp.reason = customValidationResult.smtp.reason.toString();
      }
    }
  }
  return Job.updateOne({
    _id: id,
    status: {
      $ne: JobStatus.COMPLETED
    }
  }, {
    $set: {
      status: JobStatus.FAILED,
      error,
      reason: error,
    },
    $inc: {
      attemptCount: 1
    },
    $push: {
      attempts: {
        ip,
        reason: error,
        date: new Date(),
        customValidationResult: customResult,
        ...attemptData || {},
      }
    }
  });
}

JobSchema.statics.checkRequestCompleted = async (jobId: string) => {
  const job = await Job.findById(jobId).select({ request: 1 }).populate('request', {
    completedCount: 1,
    totalCount: 1,
  });
  if (!job) {
    throw new Error('Job not found');
  }
  if (!job.request) {
    throw new Error('Request not found');
  }
  const request = job.request as RequestDocument;
  return {
    requestId: request.id,
    completed: request.completedCount >= request.totalCount,
  };
}

export const Job = mongoose.model<JobDocument, JobModel>('Job', JobSchema);
