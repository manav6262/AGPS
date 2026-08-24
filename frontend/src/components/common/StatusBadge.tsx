import React from 'react';
import { TenderStatus } from '../../types/index.js';

interface StatusBadgeProps {
  status: TenderStatus | string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  let style = 'bg-stone-100 text-stone-700 border-stone-200';

  switch (status) {
    case 'PUBLISHED':
    case 'FINANCIAL_OPEN':
    case 'EVALUATED':
    case 'WINNER_SELECTED':
    case 'PASSED':
    case 'ELIGIBLE':
      // Semantic Passed / Eligible Green (ONLY for valid states)
      style = 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]';
      break;

    case 'BIDDING_OPEN':
    case 'PENDING':
    case 'WARNING':
      // Semantic Warning / In-Progress Amber
      style = 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]';
      break;

    case 'BIDDING_CLOSED':
    case 'DRAFT':
    case 'CLOSED':
    case 'NEUTRAL':
      // Neutral Warm Grey
      style = 'bg-[#F5F5F4] text-[#57534E] border-[#E7E5E4]';
      break;

    case 'CANCELLED':
    case 'FAILED':
    case 'REJECTED':
    case 'INELIGIBLE':
    case 'DISQUALIFIED':
      // Semantic Failed / Error Red
      style = 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]';
      break;
  }

  const label = status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border uppercase tracking-wider ${style} ${className}`}
    >
      {label}
    </span>
  );
};
