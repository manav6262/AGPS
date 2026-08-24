/**
 * Bid Controller with Ownership-Scoped Querying (SPEC §17.2, §23)
 */

import { Request, Response, NextFunction } from 'express';
import { Bid } from '../models/bid.js';
import { Types } from 'mongoose';

export async function getBidById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Bid not found' });
      return;
    }

    // IDOR Prevention (SPEC §17.2, Test 33):
    // Scoping is structural in the MongoDB query filter, never checked after fetching!
    const filter =
      req.user.role === 'VENDOR'
        ? { _id: new Types.ObjectId(id), vendor: new Types.ObjectId(req.user.id) }
        : { _id: new Types.ObjectId(id) };

    const bid = await Bid.findOne(filter).exec();

    if (!bid) {
      // Return 404 (does not leak existence of other vendors' bids)
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Bid not found',
      });
      return;
    }

    res.status(200).json({ bid });
  } catch (err) {
    next(err);
  }
}
