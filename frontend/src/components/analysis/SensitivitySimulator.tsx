import React, { useState, useMemo } from 'react';
import { ScoringCriterion, RankedResult } from '@agps/shared';
import { simulateSawScoring } from '../../utils/sensitivity.js';
import { Sliders, RotateCcw, Award, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SensitivitySimulatorProps {
  results: RankedResult[];
  criteria: ScoringCriterion[];
}

export const SensitivitySimulator: React.FC<SensitivitySimulatorProps> = ({
  results,
  criteria,
}) => {
  // Initialize weights from original criteria
  const initialWeights = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of criteria) {
      map[c.key] = c.weight;
    }
    return map;
  }, [criteria]);

  const [weights, setWeights] = useState<Record<string, number>>(initialWeights);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  // Proportional rebalancing when slider moves
  const handleSliderChange = (changedKey: string, newValue: number) => {
    const delta = newValue - (weights[changedKey] || 0);
    const otherKeys = criteria.filter((c) => c.key !== changedKey).map((c) => c.key);
    const otherTotal = otherKeys.reduce((acc, k) => acc + (weights[k] || 0), 0);

    const newWeights: Record<string, number> = { ...weights, [changedKey]: newValue };

    if (otherTotal > 0 && otherKeys.length > 0) {
      for (const k of otherKeys) {
        const share = (weights[k] || 0) / otherTotal;
        const adjusted = Math.max(0, Math.round((weights[k] || 0) - delta * share));
        newWeights[k] = adjusted;
      }
    }

    // Exact normalization to 100
    const currentSum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    const diff = 100 - currentSum;
    if (diff !== 0 && otherKeys.length > 0) {
      newWeights[otherKeys[0]] = Math.max(0, (newWeights[otherKeys[0]] || 0) + diff);
    }

    setWeights(newWeights);
  };

  const handleReset = () => {
    setWeights(initialWeights);
  };

  const handlePreset = (preset: 'PRICE_HEAVY' | 'QUALITY_HEAVY') => {
    if (preset === 'PRICE_HEAVY') {
      setWeights({ price: 40, quality: 30, delivery: 20, experience: 10 });
    } else if (preset === 'QUALITY_HEAVY') {
      setWeights({ price: 20, quality: 50, delivery: 20, experience: 10 });
    }
  };

  // Re-run SAW scoring live
  const simulatedScores = useMemo(() => {
    return simulateSawScoring(results, criteria, weights);
  }, [results, criteria, weights]);

  const originalWinner = results.find((r) => r.rank === 1)?.vendorName;
  const simulatedWinner = simulatedScores[0]?.vendorName;
  const winnerFlipped = originalWinner && simulatedWinner && originalWinner !== simulatedWinner;

  return (
    <div className="space-y-6">
      {/* Controls & Preset Bar */}
      <div className="gov-panel">
        <div className="gov-panel-header">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-brand" />
              <span>Real-Time SAW Weight Sensitivity Simulator</span>
            </h3>
            <p className="text-xs text-stone-500">
              Adjust criterion weights to explore rank sensitivity and winner stability thresholds
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePreset('PRICE_HEAVY')}
              className="btn-secondary text-xs px-2.5 py-1"
            >
              Preset: Price-Heavy (40/30/20/10)
            </button>
            <button
              onClick={() => handlePreset('QUALITY_HEAVY')}
              className="btn-secondary text-xs px-2.5 py-1"
            >
              Preset: Quality-Heavy (20/50/20/10)
            </button>
            <button
              onClick={handleReset}
              className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 text-stone-600"
              title="Reset to official frozen weights"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {criteria.map((c) => {
            const currentVal = weights[c.key] ?? c.weight;
            return (
              <div key={c.key} className="bg-stone-50 p-3 rounded-sm border border-stone-200 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-stone-800">{c.label}</span>
                  <span className="font-mono font-bold text-brand">{currentVal}%</span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={currentVal}
                  onChange={(e) => handleSliderChange(c.key, Number(e.target.value))}
                  className="w-full accent-brand cursor-pointer"
                />

                <div className="flex justify-between text-[10px] text-stone-500 font-mono">
                  <span>Orig: {c.weight}%</span>
                  <span>{c.direction} ({c.unit})</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex justify-between items-center text-xs pt-2 border-t border-stone-100">
          <span className="text-stone-500">Constraint: All weights automatically sum to 100%</span>
          <span className="font-mono font-bold text-stone-800">Sum: {totalWeight}%</span>
        </div>
      </div>

      {/* Live Winner Flip Alert */}
      {winnerFlipped && (
        <div className="gov-panel bg-status-warningBg border-status-warningBorder text-status-warningText p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-status-warningText shrink-0" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                Winner Rank Flip Detected!
              </div>
              <div className="text-xs text-stone-800 mt-0.5">
                Under this simulated configuration, <strong className="text-stone-950">{simulatedWinner}</strong> overtakes original winner <strong className="text-stone-600">{originalWinner}</strong>!
              </div>
            </div>
          </div>
          <span className="font-mono text-xs font-bold px-2 py-0.5 bg-white rounded-sm border border-status-warningBorder">
            Rank 1 Switch
          </span>
        </div>
      )}

      {/* Simulated Live Ranking Table */}
      <div className="gov-panel p-0 overflow-hidden">
        <div className="p-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Simulated Ranking Outcomes ({simulatedScores.length} Eligible Bids)
          </h4>
          <span className="text-[11px] font-mono text-stone-500">Live SAW Composite Arithmetic</span>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Simulated Rank</th>
                <th>Vendor Name & Bid ID</th>
                <th>Rank Movement</th>
                <th>Original Score</th>
                <th>Simulated Score</th>
                <th>Score Delta</th>
              </tr>
            </thead>
            <tbody>
              {simulatedScores.map((s) => {
                const scoreDiff = s.simulatedScore - s.originalScore;
                return (
                  <tr
                    key={s.bidId}
                    className={s.simulatedRank === 1 ? 'bg-[#F0FDF4]/50 font-semibold' : ''}
                  >
                    <td className="font-mono text-xs font-bold text-center">
                      {s.simulatedRank === 1 ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 bg-brand text-white rounded-full text-xs">
                          1
                        </span>
                      ) : (
                        `#${s.simulatedRank}`
                      )}
                    </td>
                    <td>
                      <div className="text-xs font-bold text-stone-900">{s.vendorName}</div>
                      <div className="font-mono text-[11px] text-stone-500">{s.bidId.slice(-8)}</div>
                    </td>
                    <td>
                      {s.rankDelta > 0 ? (
                        <span className="inline-flex items-center gap-0.5 font-mono text-xs font-bold text-[#15803D]">
                          <TrendingUp className="w-3.5 h-3.5" /> +{s.rankDelta} Rank
                        </span>
                      ) : s.rankDelta < 0 ? (
                        <span className="inline-flex items-center gap-0.5 font-mono text-xs font-bold text-status-failedText">
                          <TrendingDown className="w-3.5 h-3.5" /> {s.rankDelta} Rank
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 font-mono text-xs text-stone-500">
                          <Minus className="w-3.5 h-3.5" /> Unchanged
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-xs text-stone-600">
                      {s.originalScore.toFixed(4)}
                    </td>
                    <td className="font-mono text-xs font-bold text-stone-900">
                      {s.simulatedScore.toFixed(4)}
                    </td>
                    <td className="font-mono text-xs">
                      <span className={scoreDiff > 0 ? 'text-[#15803D]' : scoreDiff < 0 ? 'text-status-failedText' : 'text-stone-500'}>
                        {scoreDiff > 0 ? `+${scoreDiff.toFixed(4)}` : scoreDiff.toFixed(4)}
                      </span>
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
