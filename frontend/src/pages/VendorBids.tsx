import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { IBid } from '@agps/shared';
import { ProvenanceBadge } from '../components/common/ProvenanceBadge.js';
import { Send, Eye, FileText } from 'lucide-react';

export const VendorBids: React.FC = () => {
  const [bids, setBids] = useState<IBid[]>([]);
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
          <div className="p-8 text-center text-xs text-stone-500 font-mono" role="status" aria-live="polite">
            Loading your submitted proposals...
          </div>
        ) : bids.length === 0 ? (
          <div className="p-8 text-center space-y-3" role="status" aria-live="polite">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center mx-auto text-stone-500">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-800">No Bids Submitted Yet</h2>
              <p className="text-xs text-stone-500 mt-0.5 max-w-md mx-auto">
                Your organization has not participated in any active tenders. Browse active government procurement notices to prepare and submit sealed quotes.
              </p>
            </div>
            <div className="pt-1">
              <Link to="/tenders" className="btn-primary text-xs">
                Browse Active Tenders
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Vendor Submitted Bids Table">
            <table>
              <caption className="sr-only">Vendor Submitted Bids Portfolio</caption>
              <thead>
                <tr>
                  <th scope="col">Tender Notice</th>
                  <th scope="col">Bid ID</th>
                  <th scope="col" className="text-center">Revision</th>
                  <th scope="col">Submitted Price</th>
                  <th scope="col">Delivery Timeline</th>
                  <th scope="col">Quality Score</th>
                  <th scope="col">Provenance Status</th>
                  <th scope="col">Submission Timestamp</th>
                  <th scope="col" className="text-right">Actions</th>
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
                    <td className="text-right whitespace-nowrap">
                      <Link
                        to={`/tenders/${typeof b.tender === 'object' ? (b.tender as any)._id : b.tender}`}
                        className="btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Tender</span>
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
