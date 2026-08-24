/**
 * Vendor Profile Controller (SPEC §23)
 */

import { Request, Response, NextFunction } from 'express';
import { VendorProfile } from '../models/vendorProfile.js';
import { updateVendorProfileSchema } from '../validators/vendor.validator.js';
import { AppError } from '../services/tenderService.js';

export async function getMyVendorProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profile = await VendorProfile.findOne({ user: req.user!.id }).populate('user', 'name email role');
    if (!profile) {
      throw new AppError(404, 'PROFILE_NOT_FOUND', 'Vendor profile not found');
    }
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function updateMyVendorProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = updateVendorProfileSchema.parse(req.body);
    const profile = await VendorProfile.findOne({ user: req.user!.id });
    if (!profile) {
      throw new AppError(404, 'PROFILE_NOT_FOUND', 'Vendor profile not found');
    }

    if (data.companyName !== undefined) profile.companyName = data.companyName;
    if (data.contactPhone !== undefined) profile.contactPhone = data.contactPhone;
    if (data.address !== undefined) profile.address = data.address;
    if (data.experienceYears !== undefined) profile.experienceYears = data.experienceYears;
    if (data.annualTurnoverMinor !== undefined) profile.annualTurnoverMinor = data.annualTurnoverMinor;

    await profile.save();
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
