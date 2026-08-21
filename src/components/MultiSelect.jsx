import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

const MultiSelect = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div className="filter-group" ref={containerRef} style={{ position: 'relative' }}>
      <label>{label}</label>
      <div 
        className="select-input"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '10px' }}>
          {selected.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>All selected</span>
          ) : (
            `${selected.length} selected`
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {selected.length > 0 && (
            <X size={16} onClick={handleClear} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
          )}
          <ChevronDown size={18} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          background: 'rgba(30, 41, 59, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          maxHeight: '250px',
          overflowY: 'auto',
          zIndex: 50,
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          padding: '0.5rem 0'
        }}>
          {options.map(option => (
            <div 
              key={option.value}
              onClick={() => toggleOption(option.value)}
              style={{
                padding: '0.5rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                background: selected.includes(option.value) ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                color: selected.includes(option.value) ? 'var(--accent-blue)' : '#fff',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!selected.includes(option.value)) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={(e) => {
                if (!selected.includes(option.value)) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                border: `1px solid ${selected.includes(option.value) ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: selected.includes(option.value) ? 'var(--accent-blue)' : 'transparent'
              }}>
                {selected.includes(option.value) && <Check size={12} color="#fff" />}
              </div>
              <span style={{ fontSize: '0.875rem' }}>{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
