/**
 * Officer Management Controller (SPEC & change01.md §4, §5, §21, §22, §23)
 */

import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { User } from '../models/user.js';
import { Department } from '../models/department.js';
import { hashPassword } from '../utils/security.js';
import { createAuditEvent } from '../services/auditService.js';
import { z } from 'zod';

const createOfficerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  departmentId: z.string().min(1, 'Department is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

const updateDepartmentSchema = z.object({
  departmentId: z.string().min(1, 'Department ID is required'),
});

export async function createOfficerHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = createOfficerSchema.parse(req.body);

    // 1. Verify email uniqueness
    const existing = await User.findOne({ email: data.email.toLowerCase() });
    if (existing) {
      res.status(409).json({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'A user with this official email already exists',
      });
      return;
    }

    // 2. Verify department exists and is active
    if (!Types.ObjectId.isValid(data.departmentId)) {
      res.status(400).json({
        error: 'INVALID_DEPARTMENT',
        message: 'Invalid department identifier',
      });
      return;
    }

    const department = await Department.findById(data.departmentId);
    if (!department || !department.isActive) {
      res.status(404).json({
        error: 'DEPARTMENT_NOT_FOUND',
        message: 'Specified department does not exist or is inactive',
      });
      return;
    }

    // 3. Hash password
    const passwordHash = await hashPassword(data.password);

    // 4. Force role = PROCUREMENT_OFFICER regardless of any client input
    const officer = new User({
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash,
      role: 'PROCUREMENT_OFFICER',
      departmentId: department._id,
      isActive: true,
    });

    await officer.save();

    // 5. Cryptographic audit log for officer creation
    await createAuditEvent({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'OFFICER_CREATED',
      description: `Government procurement officer provisioned: ${officer.name} (${officer.email}) for department ${department.name}`,
      payload: {
        officerId: officer._id.toString(),
        officerEmail: officer.email,
        departmentId: department._id.toString(),
        departmentName: department.name,
      },
    });

    res.status(201).json({
      user: {
        id: officer._id,
        name: officer.name,
        email: officer.email,
        role: officer.role,
        departmentId: department._id,
        department: {
          _id: department._id,
          name: department.name,
          code: department.code,
        },
        isActive: officer.isActive,
        createdAt: officer.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listOfficersHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const officers = await User.find({
      role: { $in: ['PROCUREMENT_OFFICER', 'SUPER_ADMIN', 'ADMIN'] },
    })
      .populate('departmentId')
      .sort({ createdAt: -1 })
      .exec();

    const formatted = officers.map((u) => {
      const dept = u.departmentId as any;
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        departmentId: dept?._id || u.departmentId || null,
        department: dept ? { _id: dept._id, name: dept.name, code: dept.code } : null,
        isActive: u.isActive,
        createdAt: u.createdAt,
      };
    });

    res.status(200).json({ officers: formatted });
  } catch (err) {
    next(err);
  }
}

export async function updateOfficerStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id as string)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Officer not found' });
      return;
    }

    const { isActive } = updateStatusSchema.parse(req.body);

    // Safety rule 1: Admin cannot deactivate themselves
    if (req.user!.id === id && !isActive) {
      res.status(400).json({
        error: 'CANNOT_DEACTIVATE_SELF',
        message: 'Administrators cannot deactivate their own account',
      });
      return;
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Officer not found' });
      return;
    }

    // Safety rule 2: There must always be at least one active SUPER_ADMIN/ADMIN
    if ((targetUser.role === 'SUPER_ADMIN' || targetUser.role === 'ADMIN') && !isActive) {
      const activeAdminCount = await User.countDocuments({
        role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
        isActive: true,
        _id: { $ne: targetUser._id },
      });

      if (activeAdminCount === 0) {
        res.status(400).json({
          error: 'CANNOT_DEACTIVATE_LAST_ADMIN',
          message: 'Cannot deactivate the last active system administrator',
        });
        return;
      }
    }

    targetUser.isActive = isActive;
    await targetUser.save();

    // Audit log
    const auditAction = isActive ? 'OFFICER_ACTIVATED' : 'OFFICER_DEACTIVATED';
    await createAuditEvent({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: auditAction,
      description: `Official account ${targetUser.email} ${isActive ? 'activated' : 'deactivated'} by ${req.user!.name}`,
      payload: {
        targetUserId: targetUser._id.toString(),
        targetEmail: targetUser.email,
        newStatus: isActive,
      },
    });

    res.status(200).json({
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        isActive: targetUser.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateOfficerDepartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id as string)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Officer not found' });
      return;
    }

    const { departmentId } = updateDepartmentSchema.parse(req.body);

    if (!Types.ObjectId.isValid(departmentId)) {
      res.status(400).json({ error: 'INVALID_DEPARTMENT', message: 'Invalid department ID' });
      return;
    }

    const department = await Department.findById(departmentId);
    if (!department || !department.isActive) {
      res.status(404).json({ error: 'DEPARTMENT_NOT_FOUND', message: 'Department not found or inactive' });
      return;
    }

    const officer = await User.findById(id);
    if (!officer) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Officer not found' });
      return;
    }

    const previousDeptId = officer.departmentId?.toString() || null;
    officer.departmentId = department._id;
    await officer.save();

    // Audit log
    await createAuditEvent({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'OFFICER_DEPARTMENT_CHANGED',
      description: `Officer ${officer.name} (${officer.email}) reassigned to department ${department.name}`,
      payload: {
        officerId: officer._id.toString(),
        previousDepartmentId: previousDeptId,
        newDepartmentId: department._id.toString(),
        newDepartmentName: department.name,
      },
    });

    res.status(200).json({
      user: {
        id: officer._id,
        name: officer.name,
        email: officer.email,
        role: officer.role,
        departmentId: department._id,
        department: {
          _id: department._id,
          name: department.name,
          code: department.code,
        },
        isActive: officer.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
}
