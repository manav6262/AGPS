import React from 'react';
import { UserRole } from '../../types/index.js';

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, className = '' }) => {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-mono font-medium border border-stone-400 bg-stone-100 text-stone-800 ${className}`}
    >
      {role}
    </span>
  );
};
