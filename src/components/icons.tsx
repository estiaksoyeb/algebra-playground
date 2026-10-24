import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  ...props,
});

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </svg>
);

export const IconBook = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
    <path d="M4 17.5h16" />
    <path d="M8 7h8M8 11h6" />
  </svg>
);

export const IconFlask = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 3h6M10 3v6.5L4.5 19a1.8 1.8 0 0 0 1.6 2.5h11.8A1.8 1.8 0 0 0 19.5 19L14 9.5V3" />
    <path d="M7 15h10" />
  </svg>
);

export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 20V4M4 20h16" />
    <path d="M7 15l4-5 3 3 5-7" />
  </svg>
);

export const IconBalance = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 4v16M7 20h10M4 8h16M12 4l-8 4 4 6 4-6 4 6 4-6z" />
  </svg>
);

export const IconTiles = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const IconGraph = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 4v16h16" />
    <path d="M4 16c3-1 4-9 8-9s5 4 8 1" />
  </svg>
);

export const IconNumberLine = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 12h18" />
    <path d="M6 9v6M10 10v4M14 9v6M18 10v4" />
  </svg>
);

export const IconBox = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </svg>
);

/** Counting blocks: two stacked unit cubes, the model used to build number sense. */
export const IconBlocks = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="12.5" width="8" height="8" rx="1.5" />
    <rect x="12.5" y="3.5" width="8" height="8" rx="1.5" />
    <path d="M6 4.5h3M5 16.5h5M14 6.5h5" opacity="0.55" />
  </svg>
);

/** Numbers below zero and parts of a whole: a number line either side of zero. */
export const IconPlusMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2 12h20" />
    <path d="M6.5 10.5v3M12.5 10v4M18 10.5v3" />
    <path d="M4 6.5h5M6.5 4v5" />
    <path d="M15 18.5h5" />
  </svg>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
);

export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const IconUndo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12H9" />
  </svg>
);

export const IconRedo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h5" />
  </svg>
);

export const IconReset = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);

export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9 2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2 2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.2 1.1z" />
  </svg>
);

export const IconLightbulb = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1 1.1 1.7l.1 2.4h4.6l.1-2.4c.1-.7.5-1.3 1.1-1.7A6 6 0 0 0 12 3z" />
  </svg>
);

export const IconSave = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v5h7V3M8 21v-7h8v7" />
  </svg>
);

export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z" />
  </svg>
);

export const IconWarn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3 2.5 20h19z" />
    <path d="M12 9v5M12 17.5v.01" />
  </svg>
);

export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 17v3h16v-3" />
  </svg>
);

export const IconUpload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 17v3h16v-3" />
  </svg>
);

export const IconSun = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

/** Brand mark: balance beam + x */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="11" fill="#2f5d8a" />
      <path d="M20 9v18M14 29h12" stroke="#f7f6f2" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 15h22" stroke="#e0c257" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="10" cy="15" r="3.4" fill="#f0a26b" />
      <circle cx="30" cy="15" r="3.4" fill="#8db9e3" />
      <path d="M17 22l6-4" stroke="#f7f6f2" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

/**
 * Worlds store a stable icon *identifier* (`World.icon`), never a glyph. Render it through this
 * map so the identifier can never leak onto the screen as text; unknown values fall back to a
 * neutral symbol instead of rendering nothing.
 */
export const WorldIcon = ({ icon, ...p }: { icon: string } & SVGProps<SVGSVGElement>) => {
  switch (icon) {
    case 'blocks':
      return <IconBlocks {...p} />;
    case 'plusminus':
      return <IconPlusMinus {...p} />;
    case 'box':
      return <IconBox {...p} />;
    case 'balance':
      return <IconBalance {...p} />;
    case 'tiles':
      return <IconTiles {...p} />;
    case 'graph':
      return <IconGraph {...p} />;
    case 'star':
      return <IconStar {...p} />;
    default:
      return <IconStar {...p} />;
  }
};

export const ToolIcon = ({ tool, ...p }: { tool: string } & SVGProps<SVGSVGElement>) => {
  switch (tool) {
    case 'numberline':
      return <IconNumberLine {...p} />;
    case 'mystery':
      return <IconBox {...p} />;
    case 'balance':
      return <IconBalance {...p} />;
    case 'tiles':
      return <IconTiles {...p} />;
    case 'evaluator':
      return <IconChart {...p} />;
    case 'simplify':
      return <IconTiles {...p} />;
    case 'area':
      return <IconTiles {...p} />;
    case 'graph':
      return <IconGraph {...p} />;
    default:
      return <IconFlask {...p} />;
  }
};
