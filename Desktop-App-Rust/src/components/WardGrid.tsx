import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useBedsStore } from '../store';
import { LiveBedState } from '../types';
import BedCard from './BedCard';

interface WardGridProps {
  onSelectBed?: (bed: LiveBedState) => void;
}

type FilterStatus = 'ALL' | 'STABLE' | 'ALERT' | 'WARNING';

export default function WardGrid({ onSelectBed }: WardGridProps) {
  const bedsMap = useBedsStore((s) => s.beds);
  const beds = useMemo(() => Object.values(bedsMap), [bedsMap]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [sortBy, setSortBy] = useState<'bedId' | 'status' | 'volume'>('bedId');

  const filtered = useMemo(() => {
    let list = [...beds];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.bedId.includes(q) ||
          b.patientName.toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'ALERT') {
      list = list.filter((b) => b.status === 'BLOCKAGE' || b.status === 'EMPTY_BAG');
    } else if (statusFilter === 'STABLE') {
      list = list.filter((b) => b.status === 'STABLE');
    } else if (statusFilter === 'WARNING') {
      list = list.filter((b) => b.status === 'CONN_LOST');
    }
    list.sort((a, b) => {
      if (sortBy === 'bedId') return a.bedId.localeCompare(b.bedId);
      if (sortBy === 'status') {
        const order: Record<string, number> = { BLOCKAGE: 0, EMPTY_BAG: 1, CONN_LOST: 2, STABLE: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      }
      if (sortBy === 'volume') return a.volRemaining - b.volRemaining;
      return 0;
    });
    return list;
  }, [beds, search, statusFilter, sortBy]);

  const counts = useMemo(() => ({
    total: beds.length,
    stable: beds.filter((b) => b.status === 'STABLE').length,
    alert: beds.filter((b) => b.status === 'BLOCKAGE' || b.status === 'EMPTY_BAG').length,
    connLost: beds.filter((b) => b.status === 'CONN_LOST').length,
  }), [beds]);

  return (
    <div>
      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar">
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            placeholder="Search bed, patient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="tabs">
          {(['ALL', 'STABLE', 'ALERT', 'WARNING'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              className={`tab-btn ${statusFilter === f ? 'active' : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f === 'ALL' ? `All (${counts.total})` :
               f === 'STABLE' ? `Stable (${counts.stable})` :
               f === 'ALERT' ? `Alerts (${counts.alert})` :
               `Disconnected (${counts.connLost})`}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <SlidersHorizontal size={13} style={{ color: 'var(--text-muted)' }} />
          <select
            className="form-select"
            style={{ padding: '6px 10px', fontSize: 12 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="bedId">Sort: Bed ID</option>
            <option value="status">Sort: Status</option>
            <option value="volume">Sort: Volume (Low)</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3 style={{ color: 'var(--text-secondary)' }}>No beds found</h3>
          <p>No beds match your current filter. Add beds in Settings or wait for device data.</p>
        </div>
      ) : (
        <div className="ward-grid">
          {filtered.map((bed) => (
            <BedCard key={bed.bedId} bed={bed} onClick={() => onSelectBed?.(bed)} />
          ))}
        </div>
      )}
    </div>
  );
}
