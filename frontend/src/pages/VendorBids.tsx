import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { Bid } from '../types/index.js';
import { ProvenanceBadge } from '../components/common/ProvenanceBadge.js';
import { Send, Eye } from 'lucide-react';

export const VendorBids: React.FC = () => {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBids() {
      try {
        const res = await api.bids.getMyBids();
        setBids(res.bids || []);
      } catch (err) {
        console.error('Failed to load my bids', err);
      } finally {
        setLoading(false);
      }
    }
    loadBids();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
          <Send className="w-5 h-5 text-brand" />
          <span>My Submitted Procurement Bids</span>
        </h1>
        <p className="text-xs text-stone-500">
          History of submitted commercial quotes, delivery commitments, and evaluation outcomes
        </p>
      </div>

      <div className="gov-panel p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-stone-500">Loading your submitted bids...</div>
        ) : bids.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">
            You have not submitted any bids yet. View{' '}
            <Link to="/tenders" className="text-brand font-semibold underline">
              Available Tenders
            </Link>{' '}
            to participate.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Tender Notice</th>
                  <th>Bid ID</th>
                  <th>Revision</th>
                  <th>Submitted Price</th>
                  <th>Delivery Timeline</th>
                  <th>Quality Score</th>
                  <th>Provenance Status</th>
                  <th>Submission Timestamp</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bids.map((b) => (
                  <tr key={b._id}>
                    <td>
                      <div className="text-xs font-semibold text-stone-900">
                        {typeof b.tender === 'object' ? (b.tender as any).tenderCode : b.tender}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {typeof b.tender === 'object' ? (b.tender as any).title : ''}
                      </div>
                    </td>
                    <td className="font-mono text-xs text-stone-700 whitespace-nowrap">{b._id.slice(-8)}</td>
                    <td className="font-mono text-xs text-center">
                      <span className="bg-stone-100 px-1.5 py-0.5 rounded-sm border border-stone-200">
                        v{b.revision} {b.isLatest ? '(Latest)' : '(Archived)'}
                      </span>
                    </td>
                    <td className="font-mono text-xs font-semibold text-stone-900">
                      {b.priceMinor !== undefined
                        ? `₹${(b.priceMinor / 100).toLocaleString('en-IN')}`
                        : 'SEALED'}
                    </td>
                    <td className="font-mono text-xs">{b.deliveryDays?.value || (b.deliveryDays as any)} Days</td>
                    <td className="font-mono text-xs">{b.derivedQualityScore}/100</td>
                    <td>
                      <ProvenanceBadge status="SELF_REPORTED" source="PORTAL" />
                    </td>
                    <td className="text-xs text-stone-600 whitespace-nowrap">
                      {new Date(b.submittedAt).toLocaleString('en-IN')}
                    </td>
                    <td className="text-right">
                      <Link
                        to={`/tenders/${typeof b.tender === 'object' ? (b.tender as any)._id : b.tender}`}
                        className="btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Tender</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
