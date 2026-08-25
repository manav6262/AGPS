/**
 * Bid Controller (SPEC §17.2, §23)
 */

import { Request, Response, NextFunction } from 'express';
import { Bid } from '../models/bid.js';
import { submitBid, getBidsForTender } from '../services/bidService.js';
import { submitBidSchema } from '../validators/bid.validator.js';
import { Types } from 'mongoose';

export async function submitBidHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = submitBidSchema.parse(req.body);
    const bid = await submitBid(req.params.id as string, req.user!.id, data);
    res.status(201).json({ bid });
  } catch (err) {
    next(err);
  }
}

export async function getTenderBidsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const bids = await getBidsForTender(req.params.id as string, req.user!);
    res.status(200).json({ bids });
  } catch (err) {
    next(err);
  }
}

export async function getMyBidsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const bids = await Bid.find({ vendor: new Types.ObjectId(req.user!.id) })
      .select('+priceMinor')
      .sort({ submittedAt: -1 })
      .populate('tender', 'tenderCode title status deadlineAt')
      .exec();
    res.status(200).json({ bids });
  } catch (err) {
    next(err);
  }
}

export async function getBidById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    if (!Types.ObjectId.isValid(id as string)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Bid not found' });
      return;
    }

    // IDOR Prevention (SPEC §17.2, Test 33):
    // Scoping is structural in the MongoDB query filter, never checked after fetching!
    const filter =
      req.user.role === 'VENDOR'
        ? { _id: new Types.ObjectId(id as string), vendor: new Types.ObjectId(req.user.id) }
        : { _id: new Types.ObjectId(id as string) };

    const query = Bid.findOne(filter).populate('tender', 'status');

    // Vendors can always see their own price; Admin/Auditor only if unsealed
    if (req.user.role === 'VENDOR') {
      query.select('+priceMinor');
    }

    const bid = await query.exec();

    if (!bid) {
      // Return 404 (does not leak existence of other vendors' bids)
      res.status(404).json({ error: 'NOT_FOUND', message: 'Bid not found' });
      return;
    }

    // Price sealing check for Admin/Auditor (SPEC §17.4)
    const tenderStatus = (bid.tender as any)?.status;
    const isUnsealed =
      tenderStatus === 'FINANCIAL_OPEN' ||
      tenderStatus === 'EVALUATED' ||
      tenderStatus === 'WINNER_SELECTED' ||
      tenderStatus === 'CLOSED';

    if (!isUnsealed && req.user.role !== 'VENDOR') {
      // Model projection select: false already excludes priceMinor, but reinforce defense-in-depth
      const plain = bid.toObject();
      delete (plain as any).priceMinor;
      res.status(200).json({ bid: plain });
      return;
    }

    res.status(200).json({ bid });
  } catch (err) {
    next(err);
  }
}
