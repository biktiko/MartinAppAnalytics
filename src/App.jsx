import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import localforage from 'localforage';
import { UploadCloud, FileType2, X } from 'lucide-react';
import MultiSelect from './components/MultiSelect';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import AdvancedAnalytics from './components/AdvancedAnalytics';
import { processCSVData } from './utils/dataProcessor';

function App() {
  const [fileSources, setFileSources] = useState([]); // Array of { name, data: [] }
  const [data, setData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isInitializing, setIsInitializing] = useState(true);

  // Load from localforage on mount
  useEffect(() => {
    localforage.getItem('martinAppFileSources').then((savedSources) => {
      if (savedSources && Array.isArray(savedSources)) {
        setFileSources(savedSources);
      }
      setIsInitializing(false);
    }).catch(err => {
      console.error("Failed to load fileSources from localforage", err);
      setIsInitializing(false);
    });
  }, []);

  // Filter States
  const [campaigns, setCampaigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [regions, setRegions] = useState([]);
  const [statuses, setStatuses] = useState([]);

  const [winDateFrom, setWinDateFrom] = useState('');
  const [winDateTo, setWinDateTo] = useState('');
  const [createDateFrom, setCreateDateFrom] = useState('');
  const [createDateTo, setCreateDateTo] = useState('');

  // Recalculate combined data whenever fileSources change
  useEffect(() => {
    if (isInitializing) return;

    localforage.setItem('martinAppFileSources', fileSources).catch(err => {
      console.error("Failed to save fileSources to localforage", err);
    });

    if (fileSources.length === 0) {
      setData([]);
    } else {
      const allRaw = fileSources.map(f => f.data);
      const processed = processCSVData(allRaw);
      setData(processed);
    }
  }, [fileSources, isInitializing]);

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    parseFiles(files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
    if (!files.length) return;
    parseFiles(files);
  };

  const parseFiles = (files) => {
    setIsProcessing(true);
    let processedCount = 0;
    const newSources = [];

    files.forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        complete: (results) => {
          newSources.push({
            name: file.name,
            size: file.size,
            data: results.data
          });
          processedCount++;
          if (processedCount === files.length) {
            setFileSources(prev => {
              // avoid duplicate names by appending timestamp if needed, but for now just merge
              const existingNames = prev.map(p => p.name);
              const filteredNew = newSources.filter(n => !existingNames.includes(n.name));
              return [...prev, ...filteredNew];
            });
            setIsProcessing(false);
          }
        }
      });
    });
  };

  const removeFile = (fileName) => {
    setFileSources(prev => prev.filter(f => f.name !== fileName));
  };

  // Extract unique options for filters
  const filterOptions = useMemo(() => {
    const opts = {
      campaigns: new Set(),
      products: new Set(),
      prizes: new Set(),
      regions: new Set(),
      statuses: new Set()
    };
    
    data.forEach(d => {
      if (d.CampaignName) opts.campaigns.add(d.CampaignName);
      if (d.ProductName) opts.products.add(d.ProductName);
      if (d.PrizeName) opts.prizes.add(d.PrizeName);
      if (d.RegionName) opts.regions.add(d.RegionName);
      if (d.PrizeStatusName) opts.statuses.add(d.PrizeStatusName);
    });

    const formatOptions = (set) => Array.from(set).filter(Boolean).map(val => ({ label: val, value: val })).sort((a,b) => String(a.label).localeCompare(String(b.label)));

    return {
      campaigns: formatOptions(opts.campaigns),
      products: formatOptions(opts.products),
      prizes: formatOptions(opts.prizes),
      regions: formatOptions(opts.regions),
      statuses: formatOptions(opts.statuses),
    };
  }, [data]);

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (campaigns.length && !campaigns.includes(d.CampaignName)) return false;
      if (products.length && !products.includes(d.ProductName)) return false;
      if (prizes.length && !prizes.includes(d.PrizeName)) return false;
      if (regions.length && !regions.includes(d.RegionName)) return false;
      if (statuses.length && !statuses.includes(d.PrizeStatusName)) return false;

      // Date filters
      if (winDateFrom && d.win_date_parsed) {
        if (d.win_date_parsed < new Date(winDateFrom)) return false;
      }
      if (winDateTo && d.win_date_parsed) {
        const toDate = new Date(winDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (d.win_date_parsed > toDate) return false;
      }
      if (createDateFrom && d.created_date_parsed) {
        if (d.created_date_parsed < new Date(createDateFrom)) return false;
      }
      if (createDateTo && d.created_date_parsed) {
        const toDate = new Date(createDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (d.created_date_parsed > toDate) return false;
      }

      return true;
    });
  }, [data, campaigns, products, prizes, regions, statuses, winDateFrom, winDateTo, createDateFrom, createDateTo]);

  return (
    <div className="app-container">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0 0 1rem 0' }}>Martin App Analytics</h1>
        
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <button 
            onClick={() => setActiveTab('dashboard')}
            style={{
              background: activeTab === 'dashboard' ? 'var(--accent-blue)' : 'transparent',
              color: activeTab === 'dashboard' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              padding: '0.5rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('advanced')}
            style={{
              background: activeTab === 'advanced' ? 'var(--accent-purple)' : 'transparent',
              color: activeTab === 'advanced' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              padding: '0.5rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            Advanced
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            style={{
              background: activeTab === 'reports' ? 'var(--accent-green)' : 'transparent',
              color: activeTab === 'reports' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              padding: '0.5rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            Reports
          </button>
        </div>
      </header>

      {isInitializing ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <h2>Loading saved data...</h2>
        </div>
      ) : data.length === 0 ? (
        <div 
          className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('csvUpload').click()}
        >
          <UploadCloud className="upload-icon" size={64} />
          <h2 style={{ marginBottom: '1rem' }}>Upload CSV Data</h2>
          <p style={{ color: 'var(--text-muted)' }}>Drag and drop your export files here or click to browse</p>
          <input 
            type="file" 
            id="csvUpload" 
            multiple 
            accept=".csv" 
            style={{ display: 'none' }} 
            onChange={handleFileUpload}
          />
          {isProcessing && <p style={{ marginTop: '1rem', color: 'var(--accent-blue)' }}>Processing data...</p>}
        </div>
      ) : (
        <div className="dashboard-layout">
          
          {/* Loaded Files Section */}
          <div className="files-container">
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Loaded Files:</span>
            {fileSources.map(f => (
              <div key={f.name} className="file-chip">
                <span title={f.name}>{f.name}</span>
                <button onClick={() => removeFile(f.name)} title="Remove file"><X size={14} /></button>
              </div>
            ))}
            <label htmlFor="addMore" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-blue)', fontSize: '0.875rem', padding: '0.4rem 0.8rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '20px' }}>
              <FileType2 size={16} /> Add CSV
              <input type="file" id="addMore" multiple accept=".csv" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
          </div>

          {/* Presets */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Quick Presets:</span>
            <button 
              onClick={() => {
                const geo = filterOptions.campaigns.map(c => c.value).filter(n => n.toLowerCase().includes('грузи'));
                setCampaigns(geo);
                setWinDateFrom(''); setWinDateTo(''); setCreateDateFrom(''); setCreateDateTo('');
                setRegions([]); setStatuses([]); setPrizes([]); setProducts([]);
              }}
              style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#fff', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.4rem 1rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Georgia (Money Seeds)
            </button>
            <button 
              onClick={() => {
                const arm = filterOptions.campaigns.map(c => c.value).filter(n => n.toLowerCase().includes('армени'));
                setCampaigns(arm);
                setCreateDateFrom('2026-05-11');
                setWinDateFrom(''); setWinDateTo(''); setCreateDateTo('');
                setRegions([]); setStatuses([]); setPrizes([]); setProducts([]);
              }}
              style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#fff', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.4rem 1rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Armenia (Money Seeds)
            </button>
          </div>

          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="filter-group date-group">
              <label>Scan Date</label>
              <div className="date-range-inputs">
                <input type="date" className="select-input" value={winDateFrom} onChange={e => setWinDateFrom(e.target.value)} title="From Date" />
                <span style={{color: 'var(--text-muted)'}}>-</span>
                <input type="date" className="select-input" value={winDateTo} onChange={e => setWinDateTo(e.target.value)} title="To Date" />
              </div>
            </div>

            <div className="filter-group date-group">
              <label>Create Date</label>
              <div className="date-range-inputs">
                <input type="date" className="select-input" value={createDateFrom} onChange={e => setCreateDateFrom(e.target.value)} title="From Date" />
                <span style={{color: 'var(--text-muted)'}}>-</span>
                <input type="date" className="select-input" value={createDateTo} onChange={e => setCreateDateTo(e.target.value)} title="To Date" />
              </div>
            </div>

            <MultiSelect label="Campaign" options={filterOptions.campaigns} selected={campaigns} onChange={setCampaigns} />
            <MultiSelect label="Region" options={filterOptions.regions} selected={regions} onChange={setRegions} />
            <MultiSelect label="Win Status" options={filterOptions.statuses} selected={statuses} onChange={setStatuses} />
            <MultiSelect label="Prize" options={filterOptions.prizes} selected={prizes} onChange={setPrizes} />
            <MultiSelect label="Product" options={filterOptions.products} selected={products} onChange={setProducts} />

            {(campaigns.length > 0 || products.length > 0 || prizes.length > 0 || regions.length > 0 || statuses.length > 0 || winDateFrom || winDateTo || createDateFrom || createDateTo) && (
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button 
                  onClick={() => { 
                    setCampaigns([]); setProducts([]); setPrizes([]); setRegions([]); setStatuses([]); 
                    setWinDateFrom(''); setWinDateTo(''); setCreateDateFrom(''); setCreateDateTo('');
                  }}
                  style={{
                    width: '100%',
                    padding: '0.65rem 1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          <main>
            {isProcessing && (
              <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '8px', marginBottom: '1rem', color: '#fff', textAlign: 'center' }}>
                Processing additional data...
              </div>
            )}
            
            {activeTab === 'dashboard' && <Dashboard data={filteredData} rawData={data} />}
            {activeTab === 'advanced' && <AdvancedAnalytics data={filteredData} />}
            {activeTab === 'reports' && <Reports data={data} filteredData={filteredData} />}
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
