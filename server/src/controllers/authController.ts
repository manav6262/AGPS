/**
 * Auth Controller (SPEC §17.1, §17.3, §23)
 */

import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.js';
import { VendorProfile } from '../models/vendorProfile.js';
import { registerVendorSchema, loginSchema } from '../validators/auth.validator.js';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/security.js';
import { DEFAULT_PROVENANCE } from '@agps/shared';

const REFRESH_COOKIE_NAME = 'refreshToken';

// In production the frontend (Vercel) and API (Render) are on different
// domains, so SameSite=Strict would prevent the refresh cookie from ever
// being sent. SameSite=None requires Secure, which is satisfied over HTTPS.
// Locally both run on localhost, so Strict is kept.
const IS_PROD = process.env.NODE_ENV === 'production';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: (IS_PROD ? 'none' : 'strict') as 'none' | 'strict',
  secure: IS_PROD,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Zod .strict() validation strips unauthorized fields (SPEC §17.3)
    const data = registerVendorSchema.parse(req.body);

    const existing = await User.findOne({ email: data.email.toLowerCase() });
    if (existing) {
      res.status(409).json({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'A user with this email address already exists',
      });
      return;
    }

    const passwordHash = await hashPassword(data.password);

    // Hardcode role to VENDOR on public registration (defense against mass assignment)
    const user = new User({
      email: data.email.toLowerCase(),
      passwordHash,
      role: 'VENDOR',
      name: data.name,
    });
    await user.save();

    const profile = new VendorProfile({
      user: user._id,
      companyName: data.companyName,
      registrationNo: data.registrationNo,
      gstin: data.gstin,
      address: data.address,
      contactPhone: data.contactPhone,
      experienceYears: data.experienceYears,
      annualTurnoverMinor: data.annualTurnoverMinor,
      provenance: { ...DEFAULT_PROVENANCE },
    });
    await profile.save();

    const tokenPayload = {
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = loginSchema.parse(req.body);

    const user = await User.findOne({ email: data.email.toLowerCase() })
      .select('+passwordHash')
      .populate('departmentId')
      .exec();

    if (!user || !user.isActive) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      return;
    }

    const validPassword = await comparePassword(data.password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      return;
    }

    const deptId = user.departmentId
      ? ((user.departmentId as any)._id ? (user.departmentId as any)._id.toString() : user.departmentId.toString())
      : undefined;

    const tokenPayload = {
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
      departmentId: deptId,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: deptId,
        department: (user.departmentId as any)?.name ? user.departmentId : undefined,
      },
      accessToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, _next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) {
      res.status(401).json({
        error: 'NO_REFRESH_TOKEN',
        message: 'Refresh token cookie is missing',
      });
      return;
    }

    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.userId).exec();

    if (!user || !user.isActive) {
      res.status(401).json({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'User no longer exists or is inactive',
      });
      return;
    }

    const deptId = user.departmentId ? user.departmentId.toString() : undefined;

    const tokenPayload = {
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
      departmentId: deptId,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch {
    res.status(401).json({
      error: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid or expired refresh token',
    });
  }
}

export function logout(_req: Request, res: Response): void {
  // Must match the attributes the cookie was set with, or it will not clear.
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
    secure: REFRESH_COOKIE_OPTIONS.secure,
  });
  res.status(200).json({
    message: 'Logged out successfully',
  });
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    const user = await User.findById(req.user.id).populate('departmentId').exec();
    if (!user) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
      return;
    }

    let vendorProfile = null;
    if (user.role === 'VENDOR') {
      vendorProfile = await VendorProfile.findOne({ user: user._id }).exec();
    }

    const deptId = user.departmentId
      ? ((user.departmentId as any)._id ? (user.departmentId as any)._id.toString() : user.departmentId.toString())
      : undefined;

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: deptId,
        department: (user.departmentId as any)?.name ? user.departmentId : undefined,
        createdAt: user.createdAt,
      },
      vendorProfile,
    });
  } catch (err) {
    next(err);
  }
}
