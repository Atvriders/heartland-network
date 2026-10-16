/** Inline SVG icon set (24x24, stroke-based, MIT-compatible original work). */
import type { ReactNode } from "react";

function Svg({
  children,
  size = 16,
  viewBox = "0 0 24 24",
}: {
  children: ReactNode;
  size?: number;
  viewBox?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconPause = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Svg>
);
export const IconPlay = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M7 5.5v13l11-6.5z" />
  </Svg>
);
export const IconTower = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 2l7 5h-4v6h-6V7H5z" />
    <circle cx="12" cy="16" r="1.4" />
    <path d="M12 3v18" opacity="0" />
    <path d="M9 17h6M10 19h4" />
  </Svg>
);
export const IconBuilding = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    <path d="M10 21v-2h4v2" />
  </Svg>
);
export const IconCabinet = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="7" y="6" width="10" height="12" rx="1.5" />
    <circle cx="10" cy="10" r="1" />
    <circle cx="14" cy="10" r="1" />
    <circle cx="12" cy="14" r="1" />
  </Svg>
);
export const IconFiber = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 20c4-4 8-4 8-8s4-4 8-8" />
    <path d="M4 12c4 0 8-4 16-8" opacity="0" />
    <circle cx="4" cy="20" r="1.4" />
    <circle cx="20" cy="4" r="1.4" />
  </Svg>
);
export const IconMicrowave = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M5 19L19 5" />
    <path d="M9 12l2-2M13 16l2-2M5 14l2-2" />
    <path d="M17 8l1-1M7 18l1-1" />
  </Svg>
);
export const IconBattery = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="8" width="16" height="8" rx="2" />
    <path d="M21 11v2" />
    <path d="M6 10.5v3M9 10.5v3" />
  </Svg>
);
export const IconGenerator = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8" />
  </Svg>
);
export const IconSolar = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </Svg>
);
export const IconWrench = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M14.7 6.3a4.5 4.5 0 00-6 5.6L3 17.6V21h3.4l5.7-5.7a4.5 4.5 0 005.6-6L14.5 12l-2.5-2.5z" />
  </Svg>
);
export const IconUpgrade = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 3l9 9h-6v9h-6v-9H3z" />
  </Svg>
);
export const IconFlask = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 006.2 21h11.6a2 2 0 001.7-2.5L14 9V3" />
    <path d="M7.5 14h9" />
  </Svg>
);
export const IconDollar = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 2v20M16.5 6.5C15 4.8 12.8 4.5 11.5 5.5S9 8.6 11 9.4c2.3 1 4.6 1.2 4 3.2s-3.2 2.9-5.5 1.6" />
  </Svg>
);
export const IconUsers = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M15.5 15.4c2.7.2 4.7 1.7 5.5 4.1" />
  </Svg>
);
export const IconAlert = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v4M12 17.2v.2" />
  </Svg>
);
export const IconSave = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M5 3h11l4 4v14H5z" />
    <path d="M8 3v6h8V3M8 21v-7h8v7" />
  </Svg>
);
export const IconMenu = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);
export const IconX = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconZoomIn = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.5-4.5M11 8v6M8 11h6" />
  </Svg>
);
export const IconZoomOut = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.5-4.5M8 11h6" />
  </Svg>
);
export const IconLayers = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Svg>
);
export const IconChart = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </Svg>
);
export const IconClock = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
);
export const IconTrash = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);
export const IconDownload = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </Svg>
);
export const IconUpload = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 21V9M7 14l5-5 5 5M4 3h16" />
  </Svg>
);
export const IconMapPin = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 21s-7-5.3-7-11a7 7 0 0114 0c0 5.7-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);
export const IconSettings = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Svg>
);
export const IconHelp = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.6 2.6 0 015 .7c0 1.8-2.5 2-2.5 3.8M12 17.3v.2" />
  </Svg>
);
export const IconStorm = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M17 9a4 4 0 00-7.7-1.3A3.2 3.2 0 008 14h10a3 3 0 00-.6-6" />
    <path d="M12 12l-2.5 4h3l-1.5 3.5" />
  </Svg>
);
export const IconFuel = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M4 21h12M8 3v4h4V3" />
    <path d="M17 11h1.5a2.5 2.5 0 012.5 2.5V21" />
  </Svg>
);
export const IconEye = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
);
export const IconMegaphone = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3 11v3l4 2 1 3h2v-4l8-4V8l-8-4v3zM13 8l5-3v14l-5-3" />
  </Svg>
);
export const IconInfo = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5v.5" />
  </Svg>
);
