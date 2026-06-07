import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export default function PickupTrailerIcon({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 45 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* GROUND ANCHOR LINE */}
      <line x1="1" y1="18" x2="44" y2="18" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" className="opacity-30" />

      {/* TRAVEL TRAILER (Beautiful, long, and aerodynamically elegant) */}
      <path 
        d="M2.5 14.5h18c1-1.2 1.5-2.5 1.5-4.5 0-2.5-1-4-2.5-4H3.5A1.5 1.5 0 0 0 2 7.5v5.5c0 .8.5 1.5.5 1.5z" 
        className="fill-slate-50/10"
      />
      
      {/* Trailer Coach Windows (Sleek dark windows with high-end look) */}
      <rect x="4.5" y="6.5" width="5" height="2.5" rx="0.5" className="fill-slate-500/10" stroke="currentColor" strokeWidth="1" />
      <rect x="11" y="6.5" width="4" height="2.5" rx="0.5" className="fill-slate-500/10" stroke="currentColor" strokeWidth="1" />
      
      {/* Trailer Utility Stripe & Door Outline */}
      <path d="M2.2 10.5H21.6" stroke="currentColor" strokeWidth="0.8" className="opacity-40" />
      <path d="M16.5 6.5h2v8h-2z" className="fill-slate-50/5" stroke="currentColor" strokeWidth="1.2" />

      {/* Premium Trailer Tandem Axle Wheels */}
      <circle cx="8" cy="15.5" r="2" className="fill-slate-800" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="13" cy="15.5" r="2" className="fill-slate-800" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="15.5" r="0.6" fill="currentColor" />
      <circle cx="13" cy="15.5" r="0.6" fill="currentColor" />

      {/* SOLID TOW HITCH SYSTEM */}
      <path d="M22 13.5h4" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="13.5" r="1.2" className="fill-slate-900" stroke="currentColor" strokeWidth="1" />

      {/* DOUBLE-CAB PICKUP TRUCK */}
      <path 
        d="M26 14.5v-4h3.5v-4.5h5l2.5 4.5h4.5v4H26z" 
        className="fill-slate-50/10"
      />
      
      {/* Pickup Cabin Windows */}
      <path d="M30 6.5h3.3l1.8 3.5H30z" className="fill-slate-500/15" stroke="currentColor" strokeWidth="1.2" />
      {/* Vertical door separation line */}
      <line x1="31.8" y1="6" x2="31.8" y2="14" stroke="currentColor" strokeWidth="1" className="opacity-40" />

      {/* Pickup Truck Wheels & Symmetrical Axles */}
      <circle cx="29.5" cy="15.5" r="2" className="fill-slate-800" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="38.5" cy="15.5" r="2" className="fill-slate-800" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="29.5" cy="15.5" r="0.6" fill="currentColor" />
      <circle cx="38.5" cy="15.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
