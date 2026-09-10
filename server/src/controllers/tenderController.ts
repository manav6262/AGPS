/**
 * Tender Controller (SPEC §23 & change01.md §10, §11, §12)
 */

import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import {
  createTender,
  updateTender,
  transitionTender,
} from '../services/tenderService.js';
import {
  createTenderSchema,
  updateTenderSchema,
  transitionTenderSchema,
} from '../validators/tender.validator.js';
import { Tender } from '../models/tender.js';
import { User } from '../models/user.js';
import { Department } from '../models/department.js';

export async function verifyTenderDepartmentAccess(
  tender: any,
  user: { id: string; role: string; departmentId?: string }
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'AUDITOR') {
    return true;
  }
  if (user.role === 'PROCUREMENT_OFFICER') {
    let officerDeptId = user.departmentId;
    if (!officerDeptId) {
      const u = await User.findById(user.id);
      officerDeptId = u?.departmentId?.toString();
    }
    if (!officerDeptId) return false;

    if (tender.departmentId && tender.departmentId.toString() === officerDeptId.toString()) {
      return true;
    }
    const dept = await Department.findById(officerDeptId);
    if (dept && tender.department === dept.name) {
      return true;
    }
    return false;
  }
  return false;
}

export async function createTenderHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = createTenderSchema.parse(req.body);
    const userRole = req.user!.role;

    let departmentId = data.departmentId ? new Types.ObjectId(data.departmentId) : undefined;
    let departmentName = data.department;
    let assignedOfficerId: Types.ObjectId | undefined = undefined;

    if (userRole === 'PROCUREMENT_OFFICER') {
      // Officers MUST create tenders in their assigned department
      let officerDeptId = req.user!.departmentId;
      if (!officerDeptId) {
        const u = await User.findById(req.user!.id);
        officerDeptId = u?.departmentId?.toString();
      }

      if (!officerDeptId) {
        res.status(403).json({
          error: 'NO_DEPARTMENT_ASSIGNED',
          message: 'Officer has no assigned government department',
        });
        return;
      }

      const dept = await Department.findById(officerDeptId);
      if (!dept) {
        res.status(404).json({
          error: 'DEPARTMENT_NOT_FOUND',
          message: 'Officer assigned department not found',
        });
        return;
      }

      departmentId = dept._id;
      departmentName = dept.name;
      assignedOfficerId = new Types.ObjectId(req.user!.id);
    } else {
      // SUPER_ADMIN or ADMIN
      if (departmentId) {
        const dept = await Department.findById(departmentId);
        if (dept) {
          departmentName = dept.name;
        }
      } else if (departmentName) {
        const dept = await Department.findOne({
          $or: [{ name: departmentName }, { code: departmentName.toUpperCase() }],
        });
        if (dept) {
          departmentId = dept._id;
        }
      }
    }

    if (!departmentName) {
      res.status(400).json({
        error: 'DEPARTMENT_REQUIRED',
        message: 'A valid department name or ID is required',
      });
      return;
    }

    const payload = {
      ...data,
      department: departmentName,
      departmentId,
      assignedOfficerId,
    };

    const tender = await createTender(payload, req.user!.id);
    res.status(201).json({ tender });
  } catch (err) {
    next(err);
  }
}

export async function getTendersHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = req.user?.role;
    let filter: Record<string, any> = {};

    // Scoped visibility: VENDOR only sees published/open/closed tenders, not DRAFT
    if (role === 'VENDOR') {
      filter = { status: { $ne: 'DRAFT' } };
    } else if (role === 'PROCUREMENT_OFFICER') {
      let officerDeptId = req.user?.departmentId;
      if (!officerDeptId) {
        const u = await User.findById(req.user?.id);
        officerDeptId = u?.departmentId?.toString();
      }

      if (officerDeptId) {
        const dept = await Department.findById(officerDeptId);
        filter = {
          $or: [
            { departmentId: new Types.ObjectId(officerDeptId) },
            ...(dept ? [{ department: dept.name }] : []),
          ],
        };
      } else {
        filter = { _id: null };
      }
    }

    const tenders = await Tender.find(filter).sort({ createdAt: -1 }).exec();
    res.status(200).json({ tenders });
  } catch (err) {
    next(err);
  }
}

export async function getTenderByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tender = await Tender.findById(req.params.id).exec();
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    // Role-based visibility check: VENDOR cannot view DRAFT tenders
    if (req.user?.role === 'VENDOR' && tender.status === 'DRAFT') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    // Role-based scope check: PROCUREMENT_OFFICER can only view department tenders
    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot access tenders from other government departments',
        });
        return;
      }
    }

    res.status(200).json({ tender });
  } catch (err) {
    next(err);
  }
}

export async function updateTenderHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const existing = await Tender.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(existing, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot modify tenders from other government departments',
        });
        return;
      }
    }

    const data = updateTenderSchema.parse(req.body);

    // Officers cannot change the department of a tender
    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      delete (data as any).department;
      delete (data as any).departmentId;
    }

    const updated = await updateTender(req.params.id as string, data, req.user!.id);
    res.status(200).json({ tender: updated });
  } catch (err) {
    next(err);
  }
}

export async function transitionTenderHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const existing = await Tender.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(existing, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot transition tenders from other government departments',
        });
        return;
      }
    }

    const data = transitionTenderSchema.parse(req.body);
    const updated = await transitionTender(req.params.id as string, data.targetStatus, req.user!.id);
    res.status(200).json({ tender: updated });
  } catch (err) {
    next(err);
  }
}
