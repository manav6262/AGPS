import React, { useMemo } from 'react';
import { ScoringCriterion, RankedResult } from '@agps/shared';
import { calculateWeightCriticalBounds } from '../../utils/sensitivity.js';
import { ShieldCheck, Award } from 'lucide-react';

interface RobustnessSummaryProps {
  results: RankedResult[];
  criteria: ScoringCriterion[];
}

export const RobustnessSummary: React.FC<RobustnessSummaryProps> = ({
  results,
  criteria,
}) => {
  const eligible = useMemo(() => results.filter((r) => r.eligible), [results]);
  const rank1 = useMemo(() => eligible.find((r) => r.rank === 1), [eligible]);
  const rank2 = useMemo(() => eligible.find((r) => r.rank === 2), [eligible]);

  const marginOfVictory = useMemo(() => {
    if (!rank1 || !rank2) return 0;
    return Math.max(0, (rank1.finalScore || 0) - (rank2.finalScore || 0));
  }, [rank1, rank2]);

  const criticalBounds = useMemo(() => {
    return calculateWeightCriticalBounds(results, criteria);
  }, [results, criteria]);

  if (!rank1 || !rank2) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Margin of Victory Card */}
      <div className="gov-panel">
        <div className="gov-panel-header">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-brand" />
              <span>Ranking Robustness & Margin of Victory Analysis</span>
            </h3>
            <p className="text-xs text-stone-500">
              Quantifies outcome stability and the sensitivity boundary of the winning bid
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-stone-500 block uppercase font-medium">
              Margin of Victory (Rank #1 vs Rank #2)
            </span>
            <span className="font-mono text-base font-bold text-[#15803D]">
              +{marginOfVictory.toFixed(4)} Composite Points
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-stone-50 p-3 rounded-sm border border-stone-200">
            <span className="font-bold text-stone-900 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-brand" />
              <span>Rank #1 Winner: {rank1.vendorName}</span>
            </span>
            <span className="font-mono text-stone-600 block mt-1">
              Final Composite Score: {rank1.finalScore?.toFixed(4)}/100
            </span>
          </div>

          <div className="bg-stone-50 p-3 rounded-sm border border-stone-200">
            <span className="font-bold text-stone-800">
              Runner-Up: {rank2.vendorName}
            </span>
            <span className="font-mono text-stone-600 block mt-1">
              Final Composite Score: {rank2.finalScore?.toFixed(4)}/100
            </span>
          </div>
        </div>
      </div>

      {/* Critical Weight Thresholds Table */}
      <div className="gov-panel p-0 overflow-hidden">
        <div className="p-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Critical Weight Thresholds & Switching Boundaries
          </h4>
          <span className="text-[11px] text-stone-500 font-mono">Sensitivity Range per Dimension</span>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Official Weight</th>
                <th>Switch Threshold Weight %</th>
                <th>Alternative Winner at Threshold</th>
                <th>Stability Buffer (± Weight %)</th>
                <th>Robustness Rating</th>
              </tr>
            </thead>
            <tbody>
              {criticalBounds.map((bound) => {
                const isHighlyRobust = bound.stabilityMargin >= 20;
                const isModerate = bound.stabilityMargin >= 10 && bound.stabilityMargin < 20;
                return (
                  <tr key={bound.criterionKey}>
                    <td className="font-semibold text-xs text-stone-900">
                      {bound.criterionLabel}
                    </td>
                    <td className="font-mono text-xs text-stone-800">
                      {bound.currentWeight}%
                    </td>
                    <td className="font-mono text-xs font-bold text-brand">
                      {bound.switchThresholdWeight !== null ? `${bound.switchThresholdWeight}%` : 'Stable across [0..100%]'}
                    </td>
                    <td className="text-xs text-stone-700">
                      {bound.newWinnerAtThreshold ? (
                        <span className="font-medium text-stone-900">{bound.newWinnerAtThreshold}</span>
                      ) : (
                        <span className="text-stone-400 font-mono">None (Winner Unchanged)</span>
                      )}
                    </td>
                    <td className="font-mono text-xs font-bold">
                      {bound.switchThresholdWeight !== null ? (
                        <span className={bound.stabilityMargin < 10 ? 'text-status-failedText' : 'text-stone-800'}>
                          ±{bound.stabilityMargin}%
                        </span>
                      ) : (
                        <span className="text-[#15803D]">100% Stable</span>
                      )}
                    </td>
                    <td>
                      {bound.switchThresholdWeight === null || isHighlyRobust ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-medium bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]">
                          HIGH ROBUSTNESS
                        </span>
                      ) : isModerate ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-medium bg-stone-100 text-stone-800 border border-stone-300">
                          MODERATE
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-medium bg-status-failedBg text-status-failedText border border-status-failedBorder">
                          HIGHLY SENSITIVE
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
