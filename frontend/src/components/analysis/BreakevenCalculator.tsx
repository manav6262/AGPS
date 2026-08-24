import React, { useState, useMemo } from 'react';
import { ScoringCriterion, RankedResult } from '@agps/shared';
import { calculateBreakevenRequirements } from '../../utils/sensitivity.js';
import { Target, CheckCircle2, XCircle } from 'lucide-react';

interface BreakevenCalculatorProps {
  results: RankedResult[];
  criteria: ScoringCriterion[];
}

export const BreakevenCalculator: React.FC<BreakevenCalculatorProps> = ({
  results,
  criteria,
}) => {
  const eligible = useMemo(() => results.filter((r) => r.eligible), [results]);
  const winner = useMemo(() => eligible.find((r) => r.rank === 1), [eligible]);

  // Non-winning bids
  const nonWinners = useMemo(() => eligible.filter((r) => r.rank !== 1), [eligible]);

  const [selectedBidId, setSelectedBidId] = useState<string>(nonWinners[0]?.bidId || '');

  const targetBid = useMemo(() => {
    return eligible.find((r) => r.bidId === selectedBidId) || nonWinners[0];
  }, [eligible, nonWinners, selectedBidId]);

  const breakevenRequirements = useMemo(() => {
    if (!targetBid || !winner) return [];
    const activeWeights: Record<string, number> = {};
    for (const c of criteria) activeWeights[c.key] = c.weight;
    return calculateBreakevenRequirements(targetBid, winner, criteria, activeWeights);
  }, [targetBid, winner, criteria]);

  if (!winner || nonWinners.length === 0) {
    return (
      <div className="gov-panel p-6 text-center text-xs text-stone-500">
        Breakeven analysis requires at least two eligible competing bids.
      </div>
    );
  }

  const scoreGap = (winner.finalScore || 0) - (targetBid?.finalScore || 0);

  return (
    <div className="space-y-4">
      {/* Target Selector & Context */}
      <div className="gov-panel">
        <div className="gov-panel-header">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-brand" />
              <span>Single-Criterion Breakeven Delta Calculator</span>
            </h3>
            <p className="text-xs text-stone-500">
              Calculate the minimum single-parameter improvement required for a non-winning vendor to overtake the Rank #1 winner
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-stone-700 whitespace-nowrap">Select Target Vendor:</label>
            <select
              value={selectedBidId}
              onChange={(e) => setSelectedBidId(e.target.value)}
              className="text-xs font-semibold"
            >
              {nonWinners.map((b) => (
                <option key={b.bidId} value={b.bidId}>
                  Rank #{b.rank}: {b.vendorName} (Score: {b.finalScore?.toFixed(2)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-stone-50 p-3 rounded-sm border border-stone-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <span className="text-stone-600">Comparing Target: </span>
            <strong className="text-stone-900">{targetBid?.vendorName}</strong> (Score: {targetBid?.finalScore?.toFixed(4)})
            <span className="text-stone-500"> vs Current Winner: </span>
            <strong className="text-brand">{winner.vendorName}</strong> (Score: {winner.finalScore?.toFixed(4)})
          </div>
          <span className="font-mono text-xs font-bold text-stone-800 bg-white px-2 py-0.5 rounded-sm border border-stone-300">
            Score Gap to Overcome: +{scoreGap.toFixed(4)} pts
          </span>
        </div>
      </div>

      {/* Breakeven Table */}
      <div className="gov-panel p-0 overflow-hidden">
        <div className="p-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Required Parameter Adjustments by Criterion
          </h4>
          <span className="text-[11px] text-stone-500 font-mono">Assuming other parameters stay constant</span>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Scoring Criterion</th>
                <th>Weight</th>
                <th>Current Value</th>
                <th>Target Value to Beat Winner</th>
                <th>Delta Needed</th>
                <th>Feasibility Check</th>
                <th>Analytical Explanation</th>
              </tr>
            </thead>
            <tbody>
              {breakevenRequirements.map((req) => {
                return (
                  <tr key={req.criterionKey}>
                    <td className="font-semibold text-xs text-stone-900">
                      {req.criterionLabel}
                    </td>
                    <td className="font-mono text-xs text-stone-700">
                      {criteria.find((c) => c.key === req.criterionKey)?.weight}%
                    </td>
                    <td className="font-mono text-xs text-stone-800">
                      {req.criterionKey === 'price'
                        ? `₹${(req.currentValue / 100).toLocaleString('en-IN')}`
                        : `${req.currentValue} ${req.unit}`}
                    </td>
                    <td className="font-mono text-xs font-bold text-stone-950">
                      {req.feasible ? (
                        req.criterionKey === 'price'
                          ? `₹${(req.requiredValue / 100).toLocaleString('en-IN')}`
                          : `${req.requiredValue.toFixed(2)} ${req.unit}`
                      ) : (
                        <span className="text-stone-400">N/A</span>
                      )}
                    </td>
                    <td className="font-mono text-xs font-bold">
                      {req.feasible ? (
                        <span className={req.delta < 0 ? 'text-[#15803D]' : 'text-brand'}>
                          {req.criterionKey === 'price'
                            ? `₹${(Math.abs(req.delta) / 100).toLocaleString('en-IN')} reduction`
                            : `${req.delta > 0 ? `+${req.delta.toFixed(2)}` : req.delta.toFixed(2)} ${req.unit}`}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td>
                      {req.feasible ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Achievable
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-status-failedText">
                          <XCircle className="w-3.5 h-3.5" /> Exceeds Bound
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-stone-600 max-w-sm">
                      {req.explanation}
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
