import React, { useRef, useEffect, useState } from 'react';
import type { Phase } from '../types';

interface RoadMapProps {
  phases: Phase[];
  onPinClick: (index: number) => void;
  activePhaseIdx: number | null;
}

export const RoadMap: React.FC<RoadMapProps> = ({ phases, onPinClick, activePhaseIdx }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const STEP = 160;
  const H = 420;
  const CY = H / 2;
  const AMP = 120;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [phases]);

  if (phases.length === 0) return null;

  // Build points
  const pts = phases.map((p, i) => {
    const x = 40 + i * STEP;
    const y = CY + Math.sin(i * 0.9) * AMP;
    return { x, y, p, i };
  });

  // Build bezier path
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = (pts[i].x + pts[i + 1].x) / 2;
    path += ` C ${cx} ${pts[i].y} ${cx} ${pts[i + 1].y} ${pts[i + 1].x} ${pts[i + 1].y}`;
  }

  const svgW = pts[pts.length - 1].x + 200;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (scrollRef.current?.offsetLeft || 0));
    setScrollLeft(scrollRef.current?.scrollLeft || 0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - (scrollRef.current?.offsetLeft || 0);
    const walk = (x - startX);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  const stopDragging = () => {
    setIsDragging(false);
  };

  return (
    <div style={{ position: 'relative', marginBottom: '28px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', marginBottom: '16px', fontFamily: 'JetBrains Mono, monospace' }}>
        Click any pin to explore that phase ↓
      </p>
      
      <div 
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        style={{ 
          overflowX: 'auto', 
          padding: '8px 0', 
          cursor: isDragging ? 'grabbing' : 'grab', 
          userSelect: 'none',
          scrollbarWidth: 'none'
        }}
      >
        <svg 
          viewBox={`0 0 ${svgW} ${H}`} 
          style={{ width: svgW, minWidth: svgW, height: H, display: 'block', overflow: 'visible' }}
        >
          {/* Road shadow */}
          <path d={path} fill="none" stroke="rgba(30,34,53,0.6)" strokeWidth="44" strokeLinecap="round" />
          {/* Road body */}
          <path d={path} fill="none" stroke="#1e2235" strokeWidth="38" strokeLinecap="round" />
          {/* Road edge lines */}
          <path d={path} fill="none" stroke="#2a3050" strokeWidth="38" strokeLinecap="round" strokeDasharray="1 0" />
          {/* Center dashes */}
          <path d={path} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="16 18" />

          {/* START label */}
          <text x={pts[0].x} y={pts[0].y + 52} textAnchor="middle" fontSize="11" fill="#55555f" fontFamily="JetBrains Mono, monospace">START</text>

          {/* Pins */}
          {pts.map(({ x, y, p, i }) => {
            const isActive = p.status === 'active';
            const isAbandoned = p.status === 'abandoned';
            const col = p.color;
            const above = i % 2 === 1;
            const ly = above ? y - 62 : y + 50;
            const nameShort = p.name.length > 16 ? p.name.slice(0, 15) + '…' : p.name;

            return (
              <g key={i}>
                {/* Pin shadow */}
                <ellipse cx={x} cy={y + 24} rx="7" ry="3" fill="rgba(0,0,0,0.4)" />

                {/* Pin interaction group */}
                <g style={{ cursor: 'pointer' }} onClick={() => onPinClick(i)}>
                  {isActive && (
                    <circle cx={x} cy={y - 24} r="24" fill={col} opacity="0.15">
                      <animate attributeName="r" values="20;28;20" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Outer circle for pulse / selection highlight */}
                  {activePhaseIdx === i && (
                    <circle cx={x} cy={y - 24} r="22" fill="none" stroke={col} strokeWidth="2" strokeDasharray="4 2" />
                  )}
                  
                  <circle 
                    cx={x} 
                    cy={y - 24} 
                    r="18" 
                    fill={isAbandoned ? '#1c1c1f' : col} 
                    stroke={col} 
                    strokeWidth={isAbandoned ? '1.5' : '0'} 
                    opacity={isAbandoned ? '1' : '0.95'} 
                  />
                  <path 
                    d={`M ${x - 8} ${y - 10} Q ${x} ${y + 8} ${x + 8} ${y - 10}`} 
                    fill={isAbandoned ? '#1c1c1f' : col} 
                    stroke={col} 
                    strokeWidth={isAbandoned ? '1.5' : '0'} 
                  />
                  <circle cx={x} cy={y - 24} r="7" fill={isAbandoned ? col : 'rgba(255,255,255,0.9)'} />
                  <text 
                    x={x} 
                    y={y - 20} 
                    textAnchor="middle" 
                    fontSize="11" 
                    fontWeight="700" 
                    fill={isAbandoned ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.7)'} 
                    fontFamily="Inter, sans-serif"
                  >
                    {i + 1}
                  </text>
                </g>

                {/* Labels */}
                <text x={x} y={ly} textAnchor="middle" fontSize="13" fontWeight="600" fill={isAbandoned ? '#55555f' : col} fontFamily="Inter, sans-serif">
                  {nameShort}
                </text>
                <text x={x} y={ly + (above ? -15 : 16)} textAnchor="middle" fontSize="11" fill="#55555f" fontFamily="JetBrains Mono, monospace">
                  {p.items.length} commits
                </text>
              </g>
            );
          })}

          {/* END flag */}
          {pts.length > 0 && (
            <text 
              x={pts[pts.length - 1].x} 
              y={pts[pts.length - 1].y - 52} 
              textAnchor="middle" 
              fontSize="11" 
              fill="#55555f" 
              fontFamily="JetBrains Mono, monospace"
            >
              NOW
            </text>
          )}
        </svg>
      </div>

      <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
        ← scroll to explore the full journey →
      </div>
    </div>
  );
};
