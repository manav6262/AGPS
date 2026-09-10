/**
 * Department Controller
 */

import { Request, Response, NextFunction } from 'express';
import { Department } from '../models/department.js';

export async function listDepartmentsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const departments = await Department.find({ isActive: true })
      .sort({ name: 1 })
      .exec();

    res.status(200).json({ departments });
  } catch (err) {
    next(err);
  }
}
