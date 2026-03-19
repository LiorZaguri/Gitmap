import React from 'react';
import type { Commit } from '../types';

interface ContributorHeatmapProps {
  commits: Commit[];
}

export const ContributorHeatmap: React.FC<ContributorHeatmapProps> = ({ commits }) => {
  // Simple heatmap: Group commits by day of week and hour
  const data = Array(7).fill(0).map(() => Array(24).fill(0));
  
  commits.forEach(c => {
    const d = new Date(c.date);
    data[d.getDay()][d.getHours()]++;
  });

  const max = Math.max(...data.flat(), 1);

  const getAlpha = (val: number) => {
    if (val === 0) return 0.05;
    return 0.1 + (val / max) * 0.9;
  };

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="ins-card" style={{ marginTop: '12px', gridColumn: '1 / -1' }}>
      <div className="ins-title">Contributor Activity (Day/Hour)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {data.map((row, dIdx) => (
          <div key={dIdx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '9px', width: '24px', color: 'var(--text3)' }}>{days[dIdx]}</span>
            <div style={{ display: 'flex', gap: '2px', flex: 1 }}>
              {row.map((val, hIdx) => (
                <div 
                  key={hIdx} 
                  title={`${days[dIdx]} ${hIdx}:00 - ${val} commits`}
                  style={{ 
                    flex: 1, 
                    height: '10px', 
                    background: `rgba(0, 208, 132, ${getAlpha(val)})`, 
                    borderRadius: '1px' 
                  }} 
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: 'var(--text3)', paddingLeft: '28px' }}>
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
};
