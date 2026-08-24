import React from 'react';
import { Provenance } from '@agps/shared';

interface ProvenanceBadgeProps {
  status?: string;
  source?: string;
  provenance?: Provenance;
  className?: string;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  status,
  source,
  provenance,
  className = '',
}) => {
  const displayStatus = status || provenance?.verificationStatus || 'UNVERIFIED';
  const displaySource = source || provenance?.source;
  const label = displaySource ? `${displayStatus} (${displaySource})` : displayStatus;

  // STRICT RULE: Provenance is NEUTRAL GREY (#57534E on #F5F5F4) with a dashed border
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-mono font-normal bg-[#F5F5F4] text-[#57534E] border border-dashed border-stone-400 select-none ${className}`}
      title={`Data Provenance: ${label}`}
    >
      {label}
    </span>
  );
};
