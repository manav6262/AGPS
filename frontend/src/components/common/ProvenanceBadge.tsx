import React from 'react';

interface ProvenanceBadgeProps {
  status?: string;
  source?: string;
  className?: string;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  status = 'UNVERIFIED',
  source,
  className = '',
}) => {
  // STRICT RULE: Provenance is always NEUTRAL GREY (#57534E on #F5F5F4), never green
  const label = source ? `${status} (${source})` : status;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-mono font-normal bg-[#F5F5F4] text-[#57534E] border border-stone-300 ${className}`}
      title={`Data Provenance: ${label}`}
    >
      {label}
    </span>
  );
};
