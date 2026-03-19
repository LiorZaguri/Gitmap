import React, { useRef, useEffect } from 'react';
import type { Phase } from '../types';

interface RoadMapProps {
  phases: Phase[];
  onPinClick: (idx: number) => void;
  activePhaseIdx?: number | null;
}

export const RoadMap: React.FC<RoadMapProps> = ({ phases, onPinClick, activePhaseIdx }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollLeft = 0;
  }, [phases]);

  // Drag to scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let isDown = false, startX = 0, scrollStart = 0;
    
    const onDown = (e: MouseEvent) => { 
      isDown = true; 
      startX = e.pageX - el.offsetLeft; 
      scrollStart = el.scrollLeft; 
      el.style.cursor = 'grabbing'; 
    };
    const onUp = () => { 
      isDown = false; 
      el.style.cursor = 'grab'; 
    };
    const onMove = (e: MouseEvent) => { 
      if (!isDown) return; 
      e.preventDefault(); 
      el.scrollLeft = scrollStart - (e.pageX - el.offsetLeft - startX); 
    };
    
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onUp);
    el.addEventListener('mousemove', onMove);
    return () => { 
      el.removeEventListener('mousedown', onDown); 
      el.removeEventListener('mouseup', onUp); 
      el.removeEventListener('mouseleave', onUp); 
      el.removeEventListener('mousemove', onMove); 
    };
  }, [phases]);

  if (!phases || phases.length === 0) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        color: '#55555f',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '13px',
        border: '1px dashed #242428',
        borderRadius: '12px',
        margin: '16px 0'
      }}>
        No phases detected yet
      </div>
    );
  }

  const STEP = 160;
  const H = 420;
  const CY = H / 2;
  const AMP = 120;
  const svgW = phases.length * STEP + 200;

  // Build pin positions
  const pts = phases.map((p, i) => ({
    x: 80 + i * STEP,
    y: CY + Math.sin(i * 0.9) * AMP,
    p
  }));

  // Build bezier road path
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = (pts[i].x + pts[i+1].x) / 2;
    path += ` C ${cx} ${pts[i].y} ${cx} ${pts[i+1].y} ${pts[i+1].x} ${pts[i+1].y}`;
  }

  return (
    <div ref={containerRef} style={{ overflowX: 'auto', cursor: 'grab', padding: '8px 0', scrollbarWidth: 'none' }}>
      <svg
        viewBox={`0 0 ${svgW} ${H}`}
        width={svgW}
        height={H}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Road layers */}
        <path d={path} fill="none" stroke="rgba(30,34,53,0.6)" strokeWidth="44" strokeLinecap="round"/>
        <path d={path} fill="none" stroke="#1e2235" strokeWidth="38" strokeLinecap="round"/>
        <path d={path} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="16 18"/>

        {/* START / NOW labels */}
        {pts[0] && <text x={pts[0].x} y={pts[0].y + 52} textAnchor="middle" fontSize="11" fill="#55555f" fontFamily="JetBrains Mono,monospace">START</text>}
        {pts[pts.length-1] && <text x={pts[pts.length-1].x} y={pts[pts.length-1].y - 52} textAnchor="middle" fontSize="11" fill="#00d084" fontFamily="JetBrains Mono,monospace">NOW</text>}

        {/* Pins */}
        {pts.map(({ x, y, p }, i) => {
          const above = i % 2 === 1;
          const ly = above ? y - 62 : y + 50;
          const nameShort = p.name.length > 16 ? p.name.slice(0, 15) + '…' : p.name;
          const isActive = p.status === 'active';
          const isAbandoned = p.status === 'abandoned';
          const col = p.color;

          return (
            <g key={p.name + i} style={{ cursor: 'pointer' }} onClick={() => onPinClick(i)}>
              {/* Glow for active */}
              {isActive && (
                <circle cx={x} cy={y - 24} r={24} fill={col} opacity={0.15}>
                  <animate attributeName="r" values="20;28;20" dur="2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite"/>
                </circle>
              )}
              {/* Shadow */}
              <ellipse cx={x} cy={y + 16} rx={9} ry={4} fill="rgba(0,0,0,0.4)"/>
              
              {/* Active Selection Highlight */}
              {activePhaseIdx === i && (
                <circle cx={x} cy={y - 24} r={22} fill="none" stroke={col} strokeWidth="2" strokeDasharray="4 2" />
              )}

              {/* Pin circle */}
              <circle cx={x} cy={y - 24} r={18} fill={isAbandoned ? '#1c1c1f' : col} stroke={col} strokeWidth={isAbandoned ? 1.5 : 0} opacity={0.95}/>
              {/* Pin tail */}
              <path d={`M ${x-8} ${y-10} Q ${x} ${y+8} ${x+8} ${y-10}`} fill={isAbandoned ? '#1c1c1f' : col} stroke={col} strokeWidth={isAbandoned ? 1.5 : 0}/>
              {/* Center dot */}
              <circle cx={x} cy={y - 24} r={7} fill={isAbandoned ? col : 'rgba(255,255,255,0.9)'}/>
              {/* Number */}
              <text x={x} y={y - 20} textAnchor="middle" fontSize="11" fontWeight="700" fill={isAbandoned ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.7)'} fontFamily="Inter,sans-serif">{i + 1}</text>
              {/* Phase name label */}
              <text x={x} y={ly} textAnchor="middle" fontSize="13" fontWeight="600" fill={isAbandoned ? '#55555f' : col} fontFamily="Inter,sans-serif">{nameShort}</text>
              {/* Commit count */}
              <text x={x} y={ly + (above ? -15 : 16)} textAnchor="middle" fontSize="11" fill="#55555f" fontFamily="JetBrains Mono,monospace">{p.items.length} commits</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
