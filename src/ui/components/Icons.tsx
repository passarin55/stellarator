/** Inline stroke icons (24×24 grid, currentColor). */
import type { SVGProps } from 'react';

const base = (d: React.ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement> & { size?: number }) {
    const { size = 16, ...rest } = props;
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
        {d}
      </svg>
    );
  };

export const IconHome = base(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />);
export const IconTorus = base(
  <>
    <ellipse cx="12" cy="12" rx="9.5" ry="5.5" />
    <path d="M7 12c1.5 1.8 8.5 1.8 10 0M8.5 11c1.8-1 5.2-1 7 0" />
  </>,
);
export const IconAxis = base(<path d="M3 15c3-6 6 2 9-3s6-4 9 1M5 18l1-2M10 9l1 2M16 10l1 2" />);
export const IconCoil = base(
  <>
    <path d="M6 4c4 0 4 16 0 16S2 4 6 4z" />
    <path d="M12 4c4 0 4 16 0 16S8 4 12 4z" />
    <path d="M18 4c4 0 4 16 0 16s-4-16 0-16z" />
  </>,
);
export const IconField = base(
  <>
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="12" r="5.5" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="9" strokeDasharray="1 3" />
  </>,
);
export const IconReactor = base(<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />);
export const IconCalc = base(
  <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4" />
  </>,
);
export const IconAtlas = base(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
  </>,
);
export const IconBook = base(<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7" />);
export const IconRefs = base(<path d="M7 4h10a2 2 0 0 1 2 2v14l-7-4-7 4V6a2 2 0 0 1 2-2z" />);
export const IconSun = base(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);
export const IconMoon = base(<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />);
export const IconMenu = base(<path d="M4 6h16M4 12h16M4 18h16" />);
export const IconSearch = base(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </>,
);
export const IconDownload = base(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const IconUpload = base(<path d="M12 20V9M7 14l5-5 5 5M5 4h14" />);
export const IconPlay = base(<path d="M7 4l13 8-13 8z" />);
export const IconStop = base(<rect x="6" y="6" width="12" height="12" rx="1" />);
export const IconCamera = base(
  <>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </>,
);
export const IconArrow = base(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconSpark = base(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />);

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" x2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path d="M32 8c13 0 24 6 24 14s-9 9-14 12-6 10-10 22c-4-12-5-19-10-22S8 30 8 22 19 8 32 8z" fill="none" stroke="url(#lg)" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="32" cy="22" r="4" fill="url(#lg)" />
    </svg>
  );
}
