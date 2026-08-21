import React, { useMemo, useState } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { format, differenceInCalendarMonths, differenceInCalendarWeeks, addDays, subDays } from 'date-fns';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

const isWin = (d) => {
  const p = d.rawPrize;
  if (p === null || p === undefined) return false;
  const strP = String(p).trim().toLowerCase();
  return strP !== '' && strP !== 'null' && strP !== '0';
};

const AdvancedAnalytics = ({ data }) => {

  const [cohortTimeMode, setCohortTimeMode] = useState('months'); // 'months' | 'weeks'

  // Settings for Prize Impact
  const [windowDays, setWindowDays] = useState(30);
  const [controlScan, setControlScan] = useState(3);
  const [minWinners, setMinWinners] = useState(20);
  const [maxScansLimit, setMaxScansLimit] = useState(20);
  const [earlyWinnersOnly, setEarlyWinnersOnly] = useState(true);
  const [deliveryStatus, setDeliveryStatus] = useState('All'); // 'All', 'Delivered'

  // 1. User Segmentation & Normalized Metrics
  const { segments, stats } = useMemo(() => {
    const userScans = new Map();
    data.forEach(d => {
      if (d.customer_id) {
        userScans.set(d.customer_id, (userScans.get(d.customer_id) || 0) + 1);
      }
    });

    const counts = Array.from(userScans.values()).sort((a, b) => a - b);
    
    let bucket1 = 0, bucket2 = 0, bucket3 = 0, bucket4 = 0;
    counts.forEach(c => {
      if (c === 1) bucket1++;
      else if (c >= 2 && c <= 3) bucket2++;
      else if (c >= 4 && c <= 9) bucket3++;
      else if (c >= 10) bucket4++;
    });

    let min = 0, q1 = 0, median = 0, q3 = 0, max = 0;
    if (counts.length > 0) {
      min = counts[0];
      max = counts[counts.length - 1];
      median = counts[Math.floor(counts.length / 2)];
      q1 = counts[Math.floor(counts.length * 0.25)];
      q3 = counts[Math.floor(counts.length * 0.75)];
    }

    return {
      segments: [
        { name: '1 Scan', value: bucket1 },
        { name: '2-3 Scans', value: bucket2 },
        { name: '4-9 Scans', value: bucket3 },
        { name: '10+ Scans', value: bucket4 }
      ].filter(s => s.value > 0),
      stats: { min, q1, median, q3, max }
    };
  }, [data]);

  // 2. Cohort Analysis (Retention)
  const cohortData = useMemo(() => {
    const userFirstDate = new Map();
    const userActivePeriods = new Map();

    const sortedData = [...data].filter(d => d.win_date_parsed && d.customer_id)
      .sort((a,b) => (a.win_date_parsed || 0) - (b.win_date_parsed || 0));

    sortedData.forEach(d => {
      const uid = d.customer_id;
      const date = d.win_date_parsed;
      
      if (!userFirstDate.has(uid)) {
        userFirstDate.set(uid, date);
      }
      
      if (!userActivePeriods.has(uid)) {
        userActivePeriods.set(uid, new Set());
      }
      
      // Store the first date of that period for the user to calc diffs later
      userActivePeriods.get(uid).add(date); 
    });

    const cohorts = new Map();
    userFirstDate.forEach((firstDate, uid) => {
      const cohortGroupKey = cohortTimeMode === 'months' 
        ? format(firstDate, 'yyyy-MM') 
        : format(firstDate, "RRRR-'W'II");

      if (!cohorts.has(cohortGroupKey)) {
        cohorts.set(cohortGroupKey, {
          period: cohortGroupKey,
          totalUsers: 0,
          retention: {} // periodIndex: count
        });
      }
      
      const cohort = cohorts.get(cohortGroupKey);
      cohort.totalUsers += 1;

      // Ensure we only count a period index once per user
      const userTrackedDiffs = new Set();
      
      const activeSet = userActivePeriods.get(uid);
      activeSet.forEach(activeDate => {
        let diff = cohortTimeMode === 'months' 
          ? differenceInCalendarMonths(activeDate, firstDate)
          : differenceInCalendarWeeks(activeDate, firstDate, { weekStartsOn: 1 });
          
        if (diff >= 0 && diff <= 12 && !userTrackedDiffs.has(diff)) {
          userTrackedDiffs.add(diff);
          cohort.retention[diff] = (cohort.retention[diff] || 0) + 1;
        }
      });
    });

    return Array.from(cohorts.values()).sort((a,b) => a.period.localeCompare(b.period));
  }, [data, cohortTimeMode]);

  // 3. Prize Efficiency
  const prizeEfficiency = useMemo(() => {
    const map = new Map();
    data.forEach(d => {
      if (!isWin(d) || !d.PrizeName) return;
      
      const name = d.PrizeName;
      if (!map.has(name)) {
        map.set(name, { name, won: 0, claimed: 0 });
      }
      
      const p = map.get(name);
      p.won += 1;
      
      const status = String(d.won_prize_status);
      if (status === '2' || status === '4') {
        p.claimed += 1;
      }
    });

    return Array.from(map.values())
      .map(p => ({
        ...p,
        percent: p.won > 0 ? ((p.claimed / p.won) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.won - a.won);
  }, [data]);

  // 4. Product Analysis
  const productAnalysis = useMemo(() => {
    const map = new Map();
    data.forEach(d => {
      if (!d.ProductName) return;
      const name = d.ProductName;
      
      if (!map.has(name)) {
        map.set(name, { name, scans: 0, usersSet: new Set() });
      }
      
      const p = map.get(name);
      p.scans += 1;
      if (d.customer_id) p.usersSet.add(d.customer_id);
    });

    return Array.from(map.values())
      .map(p => ({
        name: p.name,
        scans: p.scans,
        uniqueUsers: p.usersSet.size
      }))
      .sort((a, b) => b.scans - a.scans);
  }, [data]);

  // 5. Prize Impact Analysis
  const prizeImpactData = useMemo(() => {
    // 1. Group data by customer_id, sorted chronologically
    const userScans = new Map();
    const sorted = [...data].filter(d => d.customer_id && d.win_date_parsed)
      .sort((a,b) => a.win_date_parsed - b.win_date_parsed);
      
    sorted.forEach(d => {
      if (!userScans.has(d.customer_id)) userScans.set(d.customer_id, []);
      userScans.get(d.customer_id).push(d);
    });

    const groups = new Map(); // key -> { users: 0, scansBefore: 0, scansAfter: 0, daysBefore: 0, daysAfter: 0 }
    
    userScans.forEach((scans, uid) => {
      if (scans.length > maxScansLimit) return; // Exclude whales

      let eventDate = null;
      let groupKey = null;

      // Find first win
      const firstWinIndex = scans.findIndex(s => isWin(s));
      
      if (firstWinIndex !== -1) {
        // User is a winner
        if (earlyWinnersOnly && firstWinIndex >= 3) return; // exclude late winners
        
        const firstWin = scans[firstWinIndex];
        // Delivery status check (assume '2' or '4' is Delivered)
        if (deliveryStatus === 'Delivered' && (String(firstWin.won_prize_status) !== '2' && String(firstWin.won_prize_status) !== '4')) {
          return;
        }

        eventDate = firstWin.win_date_parsed;
        groupKey = firstWin.PrizeName || 'Unknown Prize';
      } else {
        // Control Group
        if (scans.length < controlScan) return; // exclude if they never reached control scan
        eventDate = scans[controlScan - 1].win_date_parsed;
        groupKey = 'Control Group (Scan #' + controlScan + ')';
      }

      if (!eventDate || !groupKey) return;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, { name: groupKey, isControl: firstWinIndex === -1, users: 0, sB: 0, sA: 0, dB: new Set(), dA: new Set() });
      }

      const g = groups.get(groupKey);
      g.users += 1;

      // Calculate Before and After
      const startDate = subDays(eventDate, windowDays).getTime();
      const endDate = addDays(eventDate, windowDays).getTime();
      const eventTime = eventDate.getTime();

      let userDaysBefore = new Set();
      let userDaysAfter = new Set();

      scans.forEach(s => {
        const t = s.win_date_parsed.getTime();
        const dKey = s.day_key;
        if (t >= startDate && t < eventTime) {
          g.sB += 1;
          userDaysBefore.add(dKey);
        } else if (t > eventTime && t <= endDate) {
          g.sA += 1;
          userDaysAfter.add(dKey);
        }
      });
      
      // Sum the unique days for this user into the group total
      if (g.daysBeforeTotal === undefined) { g.daysBeforeTotal = 0; g.daysAfterTotal = 0; }
      g.daysBeforeTotal += userDaysBefore.size;
      g.daysAfterTotal += userDaysAfter.size;
    });

    // Finalize aggregations
    const result = [];
    groups.forEach(g => {
      if (!g.isControl && g.users < minWinners) return; // filter by minWinners

      const avgSb = g.sB / g.users;
      const avgSa = g.sA / g.users;
      const avgDb = g.daysBeforeTotal / g.users;
      const avgDa = g.daysAfterTotal / g.users;

      const deltaScans = avgSa - avgSb;
      const deltaDays = avgDa - avgDb;
      
      const growthScans = avgSb > 0 ? (deltaScans / avgSb) * 100 : 0;
      const growthDays = avgDb > 0 ? (deltaDays / avgDb) * 100 : 0;

      result.push({
        name: g.name,
        isControl: g.isControl,
        users: g.users,
        sb: avgSb,
        sa: avgSa,
        db: avgDb,
        da: avgDa,
        dScans: deltaScans,
        dDays: deltaDays,
        gScans: growthScans,
        gDays: growthDays
      });
    });

    // Sort: Control group first, then by Delta Scans descending
    return result.sort((a,b) => {
      if (a.isControl) return -1;
      if (b.isControl) return 1;
      return b.dScans - a.dScans;
    });

  }, [data, windowDays, controlScan, minWinners, maxScansLimit, earlyWinnersOnly, deliveryStatus]);

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        No data available for analysis.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Top Row: Segmentation & Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* User Segmentation */}
        <div className="glass-card">
          <div className="chart-header">User Segmentation (By Scans)</div>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segments}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => name + ' (' + (percent * 100).toFixed(0) + '%)'}
                  labelLine={false}
                >
                  {segments.map((entry, index) => (
                    <Cell key={'cell-' + index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ background: 'rgba(30, 41, 59, 0.95)', border: 'none', borderRadius: '8px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Normalized Metrics */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="chart-header">Scans Per User (Normalized)</div>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: '1rem', padding: '1rem' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Minimum</span>
              <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{stats.min}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>1st Quartile (Q1)</span>
              <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{stats.q1}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Median</span>
              <span style={{ fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--accent-blue)' }}>{stats.median}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>3rd Quartile (Q3)</span>
              <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{stats.q3}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Maximum</span>
              <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{stats.max}</span>
            </div>

          </div>
        </div>
      </div>

      {/* Cohort Analysis */}
      <div className="glass-card">
        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Cohort Analysis (Retention)</span>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '4px' }}>
            <button
              onClick={() => setCohortTimeMode('months')}
              style={{ padding: '0.4rem 1rem', background: cohortTimeMode === 'months' ? 'var(--accent-blue)' : 'transparent', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              By Month
            </button>
            <button
              onClick={() => setCohortTimeMode('weeks')}
              style={{ padding: '0.4rem 1rem', background: cohortTimeMode === 'weeks' ? 'var(--accent-blue)' : 'transparent', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              By Week
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', minWidth: '800px' }}>
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Cohort</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Users</th>
                {Array.from({ length: cohortTimeMode === 'months' ? 6 : 12 }).map((_, i) => (
                  <th key={i} style={{ textAlign: 'center' }}>{cohortTimeMode === 'months' ? 'Month' : 'Week'} {i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohortData.map(c => (
                <tr key={c.period}>
                  <td><strong>{c.period}</strong></td>
                  <td style={{ textAlign: 'center' }}>{c.totalUsers}</td>
                  {Array.from({ length: cohortTimeMode === 'months' ? 6 : 12 }).map((_, i) => {
                    const count = c.retention[i] || 0;
                    const percent = c.totalUsers > 0 ? ((count / c.totalUsers) * 100).toFixed(0) : 0;
                    const opacity = Math.max(0.1, percent / 100);
                    return (
                      <td key={i} style={{ textAlign: 'center' }}>
                        {count > 0 ? (
                          <div style={{ 
                            background: 'rgba(16, 185, 129, ' + opacity + ')', 
                            padding: '0.25rem 0.5rem', 
                            borderRadius: '4px',
                            color: percent > 50 ? '#000' : '#fff'
                          }}>
                            {percent}% <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({count})</span>
                          </div>
                        ) : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tables Row: Prize & Product */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Prize Efficiency */}
        <div className="glass-card">
          <div className="chart-header">Prize Efficiency</div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th>Prize Name</th>
                  <th style={{ textAlign: 'right' }}>Won</th>
                  <th style={{ textAlign: 'right' }}>Claimed</th>
                  <th style={{ textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {prizeEfficiency.map(p => (
                  <tr key={p.name}>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>
                      {p.name}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.won}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent-green)' }}>{p.claimed}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ 
                        background: p.percent > 50 ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                        color: p.percent > 50 ? 'var(--accent-green)' : 'var(--text-muted)',
                        padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem'
                      }}>
                        {p.percent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Product Analysis */}
        <div className="glass-card">
          <div className="chart-header">Product Analysis</div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th>Product Name</th>
                  <th style={{ textAlign: 'right' }}>Scans</th>
                  <th style={{ textAlign: 'right' }}>Unique Users</th>
                </tr>
              </thead>
              <tbody>
                {productAnalysis.map(p => (
                  <tr key={p.name}>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>
                      {p.name}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.scans.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent-purple)' }}>{p.uniqueUsers.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. Prize Impact Analysis */}
      <div className="glass-card">
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#fff', fontSize: '1.5rem' }}>Real Prize Impact Analysis</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          This section allows you to study how winning a real prize impacts the user's subsequent activity. It analyzes the number of scans BEFORE and AFTER the win. A Control Group is included for comparison against users who won nothing.
        </p>

        {/* Impact Settings */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            
            <div className="filter-group">
              <label>Analysis Window (days before/after)</label>
              <input type="number" className="select-input" value={windowDays} onChange={e => setWindowDays(Number(e.target.value) || 0)} min="1" />
            </div>

            <div className="filter-group">
              <label>Scan for Control Group (X)</label>
              <input type="number" className="select-input" value={controlScan} onChange={e => setControlScan(Number(e.target.value) || 0)} min="1" />
            </div>

            <div className="filter-group">
              <label>Min. winners to display prize</label>
              <input type="number" className="select-input" value={minWinners} onChange={e => setMinWinners(Number(e.target.value) || 0)} min="1" />
            </div>

            <div className="filter-group">
              <label>Exclude whales (max. scans)</label>
              <input type="number" className="select-input" value={maxScansLimit} onChange={e => setMaxScansLimit(Number(e.target.value) || 0)} min="1" />
            </div>

            <div className="filter-group">
              <label>FIRST prize delivery status</label>
              <select className="select-input" value={deliveryStatus} onChange={e => setDeliveryStatus(e.target.value)}>
                <option value="All">All</option>
                <option value="Delivered">Only delivered (Status 2/4)</option>
              </select>
            </div>
          </div>
          
          <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input 
              type="checkbox" 
              id="earlyWinners" 
              checked={earlyWinnersOnly} 
              onChange={e => setEarlyWinnersOnly(e.target.checked)} 
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="earlyWinners" style={{ fontSize: '0.9rem', color: '#fff', cursor: 'pointer' }}>
              Consider only winners who won their first prize no later than the 3rd scan
            </label>
          </div>
        </div>

        <h4 style={{ margin: '0 0 1rem 0' }}>Activity Summary: {windowDays} days BEFORE and AFTER the event (win or X-th scan)</h4>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', minWidth: '1000px' }}>
            <thead>
              <tr>
                <th>Group / Prize</th>
                <th style={{ textAlign: 'right' }}>Users</th>
                <th style={{ textAlign: 'right' }}>Scans BEFORE</th>
                <th style={{ textAlign: 'right' }}>Scans AFTER</th>
                <th style={{ textAlign: 'right' }}>Days BEFORE</th>
                <th style={{ textAlign: 'right' }}>Days AFTER</th>
                <th style={{ textAlign: 'right' }}>Δ Scans</th>
                <th style={{ textAlign: 'right' }}>Δ Days</th>
                <th style={{ textAlign: 'right' }}>Scan Growth (%)</th>
                <th style={{ textAlign: 'right' }}>Days Growth (%)</th>
              </tr>
            </thead>
            <tbody>
              {prizeImpactData.map(row => (
                <tr key={row.name} style={{ background: row.isControl ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                  <td style={{ fontWeight: row.isControl ? 'bold' : 'normal', color: row.isControl ? '#fff' : 'var(--accent-blue)' }}>{row.name}</td>
                  <td style={{ textAlign: 'right' }}>{row.users}</td>
                  <td style={{ textAlign: 'right' }}>{row.sb.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{row.sa.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>{row.db.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{row.da.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', color: row.dScans > 0 ? 'var(--accent-green)' : (row.dScans < 0 ? '#ef4444' : '#fff') }}>
                    {row.dScans > 0 ? '+' : ''}{row.dScans.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', color: row.dDays > 0 ? 'var(--accent-green)' : (row.dDays < 0 ? '#ef4444' : '#fff') }}>
                    {row.dDays > 0 ? '+' : ''}{row.dDays.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: row.gScans > 0 ? 'var(--accent-green)' : (row.gScans < 0 ? '#ef4444' : '#fff') }}>
                    {row.gScans.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: row.gDays > 0 ? 'var(--accent-green)' : (row.gDays < 0 ? '#ef4444' : '#fff') }}>
                    {row.gDays.toFixed(1)}%
                  </td>
                </tr>
              ))}
              {prizeImpactData.length === 0 && (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '2rem' }}>No data. Change filter settings.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default AdvancedAnalytics;
