import { Request, Router } from "express";
import { isValidObjectId, Types } from "mongoose";
import { Request as RequestCollection } from "../../models/request";
import { generateCSV } from '../helpers/export';

// export function convertReason(reason?: string) {
//   switch (reason) {
//     case 'INVALID_VENDOR':
//     case 'GREYLISTED':
//     case 'UNKNOWN':
//     case 'INVALID_VENDOR_RESPONSE':
//     case 'CRASH':
//     case 'ANTI_SPAM': 
//       return 'UNKNOWN';
//     case 'VALID':
//       return 'VALID';
//     case 'INVALID':
//       return 'INVALID';
//     case 'SPAMTRAP':
//       return 'SPAMTRAP';
//     case 'BLACKLISTED':
//       return 'BLACKLISTED';
//     case 'NO_MX_RECORD':
//       return 'NO_MX_RECORD';
//     case 'DOMAIN_NOT_FOUND':
//       return 'DOMAIN_NOT_FOUND';
//     case 'CONSUMER_NOTFOUND':
//       return 'REJECTED_EMAIL';
//     case 'INVALID_HOSTNAME':
//       return 'INVALID_HOSTNAME';
//     case 'TIMEOUT':
//       return 'TIMEOUT';
//     case 'CATCH_ALL':
//       return 'CATCH_ALL';
//     case 'INBOX_FULL':
//       return 'INBOX_FULL';
//     case 'RISKY':
//       return 'RISKY';
//     case 'DISPOSABLE':
//       return 'DISPOSABLE';
//     default:
//       return 'UNKNOWN';
//   }
// }

export const reportsRouter = Router();

reportsRouter.get("/reports/:requestId", async (req: Request, res) => {
  const requestId = new Types.ObjectId(req.params.requestId);
  if (!isValidObjectId(requestId)) {
    return res.status(400).send('invalid request id');
  }
  const request = await RequestCollection.findById(requestId);
  if (!request) {
    return res.status(404).send('request not found');
  }

  const reason = req.query.reason as string;
  const resultType = req.query.resultType as string;
  const filePath = await generateCSV({
    requestId: request._id,
    reason,
    resultType,
  });
  res.sendFile(filePath);
});