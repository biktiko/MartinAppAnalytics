import React, { useMemo, useState } from 'react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import * as XLSX from 'xlsx';
import { Download, Maximize2, Minimize2 } from 'lucide-react';
import { startOfWeek, startOfMonth, format } from 'date-fns';

const isWin = (d) => {
  const p = d.rawPrize;
  if (p === null || p === undefined) return false;
  const strP = String(p).trim().toLowerCase();
  return strP !== '' && strP !== 'null' && strP !== '0';
};

const Dashboard = ({ data, rawData }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [data]);
  
  const [timeMode, setTimeMode] = useState('daily'); // daily, weekly, monthly
  const [newUserMode, setNewUserMode] = useState('global'); // 'filtered' | 'global'
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [visibleLines, setVisibleLines] = useState({ scans: true, wins: true, newUsers: true });

  const handleLegendClick = (e) => {
    setVisibleLines(prev => ({ ...prev, [e.dataKey]: !prev[e.dataKey] }));
  };

  // KPI Calculations
  const totalScans = data.length;
  const totalWins = data.filter(isWin).length;
  const winProbability = totalScans > 0 ? ((totalWins / totalScans) * 100).toFixed(2) : 0;
  
  // Calculate unique users and their first seen date
  const uniqueUsersMap = useMemo(() => {
    const map = new Map();
    // Sort data chronologically (oldest first) to find the first scan date of each user
    const sortedAsc = [...data].sort((a,b) => (a.win_date_parsed || 0) - (b.win_date_parsed || 0));
    sortedAsc.forEach(d => {
      if (d.customer_id && d.day_key) {
        if (!map.has(d.customer_id)) {
          map.set(d.customer_id, d.day_key);
        }
      }
    });
    return map;
  }, [data]);
  const uniqueUsers = uniqueUsersMap.size;

  // New users grouped by day
  const newUsersByDay = useMemo(() => {
    const counts = new Map();
    for (const [userId, firstDate] of uniqueUsersMap.entries()) {
      counts.set(firstDate, (counts.get(firstDate) || 0) + 1);
    }
    return counts;
  }, [uniqueUsersMap]);

  // Global unique users (ignoring filters)
  const globalUniqueUsersMap = useMemo(() => {
    const map = new Map();
    const sourceData = rawData || data;
    const sortedAsc = [...sourceData].sort((a,b) => (a.win_date_parsed || 0) - (b.win_date_parsed || 0));
    sortedAsc.forEach(d => {
      if (d.customer_id && d.day_key) {
        if (!map.has(d.customer_id)) {
          map.set(d.customer_id, d.day_key);
        }
      }
    });
    return map;
  }, [rawData, data]);

  const globalNewUsersByDay = useMemo(() => {
    const counts = new Map();
    // We only care about users who are active in the CURRENTLY FILTERED data.
    // If a user's FIRST appearance in the filtered data matches their GLOBALLY FIRST appearance,
    // they are counted as a true global new user on that date.
    for (const [userId, firstFilteredDate] of uniqueUsersMap.entries()) {
      const globalFirstDate = globalUniqueUsersMap.get(userId);
      if (globalFirstDate === firstFilteredDate) {
        counts.set(firstFilteredDate, (counts.get(firstFilteredDate) || 0) + 1);
      }
    }
    return counts;
  }, [uniqueUsersMap, globalUniqueUsersMap]);

  // Aggregate over time (daily, weekly, monthly)
  const timeData = useMemo(() => {
    const map = new Map();
    
    data.forEach(d => {
      if (!d.win_date_parsed) return;
      
      let dateKey = d.day_key;
      let displayDate = d.day_key;

      if (timeMode === 'weekly') {
        const weekStart = startOfWeek(d.win_date_parsed, { weekStartsOn: 1 });
        dateKey = format(weekStart, 'yyyy-MM-dd');
        displayDate = `Week of ${dateKey}`;
      } else if (timeMode === 'monthly') {
        const monthStart = startOfMonth(d.win_date_parsed);
        dateKey = format(monthStart, 'yyyy-MM');
        displayDate = dateKey;
      }

      if (!map.has(dateKey)) {
        map.set(dateKey, { 
          dateKey, 
          displayDate, 
          scans: 0, 
          wins: 0, 
          newUsers: 0 
        });
      }
      
      const entry = map.get(dateKey);
      entry.scans += 1;
      if (isWin(d)) {
        entry.wins += 1;
      }
    });

    // Add new users to the timeline
    const sourceUsersByDay = newUserMode === 'filtered' ? newUsersByDay : globalNewUsersByDay;
    for (const [dayKey, count] of sourceUsersByDay.entries()) {
      let dateKey = dayKey;
      if (timeMode === 'weekly') {
        const d = new Date(dayKey);
        if (!isNaN(d)) {
          dateKey = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        }
      } else if (timeMode === 'monthly') {
        const d = new Date(dayKey);
        if (!isNaN(d)) {
          dateKey = format(startOfMonth(d), 'yyyy-MM');
        }
      }
      if (map.has(dateKey)) {
        map.get(dateKey).newUsers += count;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [data, timeMode, newUsersByDay, globalNewUsersByDay, newUserMode]);

  // Calculate Averages
  const activeDaysCount = timeMode === 'daily' ? timeData.length : new Set(data.map(d => d.day_key).filter(Boolean)).size;
  const avgScans = activeDaysCount > 0 ? (totalScans / activeDaysCount).toFixed(0) : 0;
  const avgWins = activeDaysCount > 0 ? (totalWins / activeDaysCount).toFixed(0) : 0;
  const avgNewUsers = activeDaysCount > 0 ? (uniqueUsers / activeDaysCount).toFixed(0) : 0;

  // Day of Week and Hour aggregation
  const timeAnalysisData = useMemo(() => {
    const dowCounts = [0,0,0,0,0,0,0]; // Sun to Sat
    const hourCounts = new Array(24).fill(0);
    
    data.forEach(d => {
      if (d.win_date_parsed) {
        dowCounts[d.win_date_parsed.getDay()] += 1;
        hourCounts[d.win_date_parsed.getHours()] += 1;
      }
    });

    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowData = dowCounts.map((val, idx) => ({ name: dowNames[idx], count: val }));
    const hourData = hourCounts.map((val, idx) => ({ name: `${String(idx).padStart(2, '0')}:00`, count: val }));

    return { dowData, hourData };
  }, [data]);

  // Monetary Calculations
  const getPrizeValue = (prizeName) => {
    if (!prizeName) return 0;
    const match = prizeName.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  let totalAmd = 0;
  let distributedAmd = 0;
  let totalLari = 0;
  let distributedLari = 0;

  data.forEach(d => {
    const pId = parseInt(d.prize_id, 10);
    if (isNaN(pId)) return;

    if (pId >= 49 && pId <= 53) {
      const val = getPrizeValue(d.PrizeName);
      totalLari += val;
      const status = String(d.won_prize_status);
      if (status === '2' || status === '4') distributedLari += val;
    } else if (pId >= 54 && pId <= 59) {
      const val = getPrizeValue(d.PrizeName);
      totalAmd += val;
      const status = String(d.won_prize_status);
      if (status === '2' || status === '4') distributedAmd += val;
    }
  });

  // Date Range
  const dateRange = useMemo(() => {
    const validDates = data.filter(d => d.win_date_parsed).map(d => d.win_date_parsed);
    if (validDates.length === 0) return { first: 'N/A', last: 'N/A' };
    
    let min = validDates[0];
    let max = validDates[0];
    for (let d of validDates) {
      if (d < min) min = d;
      if (d > max) max = d;
    }
    
    const formatStr = (dateObj) => {
      const pad = (n) => n.toString().padStart(2, '0');
      return `${pad(dateObj.getDate())}.${pad(dateObj.getMonth()+1)}.${dateObj.getFullYear()} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
    };
    
    return {
      first: formatStr(min),
      last: formatStr(max)
    };
  }, [data]);

  // Pagination logic
  const totalPages = Math.ceil(data.length / rowsPerPage);
  const currentData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return data.slice(start, start + rowsPerPage);
  }, [data, currentPage]);

  // Export to Excel
  const handleExport = () => {
    const exportData = data.map(row => ({
      ID: row.id,
      Campaign: row.CampaignName,
      Product: row.ProductName,
      Prize: row.PrizeName,
      Region: row.RegionName,
      "Win Date": row.win_date_adjusted,
      "Create Date": row.created_date_adjusted,
      "Customer ID": row.customer_id,
      Phone: row.phone_number,
      "First Name": row.first_name,
      "Last Name": row.last_name,
      Status: row.PrizeStatusName
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analytics");
    
    // Use timestamp to prevent browser from downloading as (1), (2) and user opening an old file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `martin_analytics_${timestamp}.xlsx`);
  };

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        No data matches the selected filters.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Analytics Overview</h2>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
          <strong>Period:</strong> {dateRange.first} — {dateRange.last}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="glass-card kpi-card">
          <div className="kpi-title">Total Scans</div>
          <div className="kpi-value">{totalScans.toLocaleString()}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-title">Total Wins</div>
          <div className="kpi-value" style={{ color: 'var(--accent-green)' }}>{totalWins.toLocaleString()}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-title">Unique Users</div>
          <div className="kpi-value" style={{ color: 'var(--accent-purple)' }}>{uniqueUsers.toLocaleString()}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-title">Win Probability</div>
          <div className="kpi-value" style={{ color: '#eab308' }}>{winProbability}%</div>
        </div>
      </div>

      {(totalAmd > 0 || totalLari > 0) && (
        <div className="kpi-grid" style={{ marginBottom: '2rem' }}>
          {totalAmd > 0 && (
            <>
              <div className="glass-card kpi-card" style={{ padding: '1.5rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <div className="kpi-title" style={{ color: '#10b981' }}>Total Prize Money (AMD)</div>
                <div className="kpi-value" style={{ color: '#10b981' }}>{totalAmd.toLocaleString('en-US')} ֏</div>
              </div>
              <div className="glass-card kpi-card" style={{ padding: '1.5rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <div className="kpi-title" style={{ color: '#10b981' }}>Distributed Money (AMD)</div>
                <div className="kpi-value" style={{ color: '#10b981' }}>{distributedAmd.toLocaleString('en-US')} ֏</div>
              </div>
            </>
          )}
          {totalLari > 0 && (
            <>
              <div className="glass-card kpi-card" style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <div className="kpi-title" style={{ color: '#3b82f6' }}>Total Prize Money (Lari)</div>
                <div className="kpi-value" style={{ color: '#3b82f6' }}>{totalLari.toLocaleString('en-US')} ₾</div>
              </div>
              <div className="glass-card kpi-card" style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <div className="kpi-title" style={{ color: '#3b82f6' }}>Distributed Money (Lari)</div>
                <div className="kpi-value" style={{ color: '#3b82f6' }}>{distributedLari.toLocaleString('en-US')} ₾</div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '2rem' }}>
        <div className="glass-card kpi-card" style={{ padding: '1rem', background: 'rgba(30, 41, 59, 0.4)' }}>
          <div className="kpi-title" style={{ fontSize: '0.75rem' }}>Avg Scans / Day</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem' }}>{avgScans}</div>
        </div>
        <div className="glass-card kpi-card" style={{ padding: '1rem', background: 'rgba(30, 41, 59, 0.4)' }}>
          <div className="kpi-title" style={{ fontSize: '0.75rem' }}>Avg Wins / Day</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem', color: 'var(--accent-green)' }}>{avgWins}</div>
        </div>
        <div className="glass-card kpi-card" style={{ padding: '1rem', background: 'rgba(30, 41, 59, 0.4)' }}>
          <div className="kpi-title" style={{ fontSize: '0.75rem' }}>Avg New Users / Day</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem', color: 'var(--accent-purple)' }}>{avgNewUsers}</div>
        </div>
      </div>
      <div 
        className="glass-card" 
        style={isChartExpanded ? {
          position: 'fixed', top: '2rem', left: '2rem', right: '2rem', bottom: '2rem', zIndex: 100, marginBottom: 0
        } : { marginBottom: '2rem' }}
      >
        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span>Timeline</span>
            
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
              {['daily', 'weekly', 'monthly'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setTimeMode(mode)}
                  style={{
                    background: timeMode === mode ? 'var(--accent-blue)' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
              <button
                onClick={() => setNewUserMode('filtered')}
                style={{
                  background: newUserMode === 'filtered' ? 'var(--accent-purple)' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                New Users: Consider Filters
              </button>
              <button
                onClick={() => setNewUserMode('global')}
                style={{
                  background: newUserMode === 'global' ? 'var(--accent-purple)' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                New Users: Ignore Filters
              </button>
            </div>

          </div>
          <button 
            onClick={() => setIsChartExpanded(!isChartExpanded)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {isChartExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>
        <div className="chart-container" style={{ height: isChartExpanded ? 'calc(100% - 3rem)' : '400px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="displayDate" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
              <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} />
              <RechartsTooltip />
              <Legend onClick={handleLegendClick} wrapperStyle={{ cursor: 'pointer' }} />
              <Line hide={!visibleLines.scans} type="monotone" dataKey="scans" name="Scans" stroke="var(--accent-blue)" strokeWidth={3} dot={timeData.length < 30} activeDot={{ r: 8 }} />
              <Line hide={!visibleLines.wins} type="monotone" dataKey="wins" name="Wins" stroke="var(--accent-green)" strokeWidth={3} dot={timeData.length < 30} activeDot={{ r: 8 }} />
              <Line hide={!visibleLines.newUsers} type="monotone" dataKey="newUsers" name="New Users" stroke="var(--accent-purple)" strokeWidth={3} dot={timeData.length < 30} activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Time Analysis Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        <div className="glass-card">
          <div className="chart-header">Scans by Day of Week</div>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeAnalysisData.dowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} />
                <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="count" name="Scans" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass-card">
          <div className="chart-header">Scans by Hour of Day</div>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeAnalysisData.hourData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={1} angle={-45} textAnchor="end" />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} />
                <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="count" name="Scans" fill="var(--accent-purple)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Detailed Data</span>
          <button 
            onClick={handleExport}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--accent-blue)', color: '#fff', 
              border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', 
              cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500'
            }}
          >
            <Download size={16} /> Export XLSX
          </button>
        </div>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Campaign</th>
                <th>Product</th>
                <th>Prize</th>
                <th>Region</th>
                <th>Win Date</th>
                <th>Create Date</th>
                <th>Customer ID</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {currentData.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.CampaignName}</td>
                  <td>{row.ProductName}</td>
                  <td>{row.PrizeName}</td>
                  <td>{row.RegionName}</td>
                  <td>{row.win_date_adjusted}</td>
                  <td>{row.created_date_adjusted}</td>
                  <td>{row.customer_id}</td>
                  <td>{row.phone_number}</td>
                  <td>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      fontSize: '0.75rem',
                      background: row.PrizeStatusName === 'Payed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)',
                      color: row.PrizeStatusName === 'Payed' ? '#10b981' : '#fff'
                    }}>
                      {row.PrizeStatusName}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="pagination">
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="pagination-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button 
                className="pagination-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
