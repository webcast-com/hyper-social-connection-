import React from "react";

const Svg = ({ size = 18, strokeWidth = 1.7, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

export const IconGrid = (props) => (
  <Svg {...props}>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </Svg>
);

export const IconPlay = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.6v6.8l5.5-3.4z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconUsers = (props) => (
  <Svg {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.5a3 3 0 0 1 0 5.6" />
    <path d="M17.5 14.4c1.8.5 3 2.2 3 4.6" />
  </Svg>
);

export const IconCalendar = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    <path d="M7.5 13.5h3M13.5 13.5h3M7.5 17h3" />
  </Svg>
);

export const IconBell = (props) => (
  <Svg {...props}>
    <path d="M18 9.5a6 6 0 1 0-12 0c0 4-1.6 5.5-1.6 5.5h15.2S18 13.5 18 9.5Z" />
    <path d="M10 19a2.3 2.3 0 0 0 4 0" />
  </Svg>
);

export const IconFile = (props) => (
  <Svg {...props}>
    <path d="M6 3.5h7l5 5v12a1.8 1.8 0 0 1-1.8 1.8H6A1.8 1.8 0 0 1 4.2 20.5v-15A1.8 1.8 0 0 1 6 3.5Z" />
    <path d="M13 3.5V9h5" />
    <path d="M8 13h6M8 16.5h6" />
  </Svg>
);

export const IconTrophy = (props) => (
  <Svg {...props}>
    <path d="M8 3.5h8v4.2a4 4 0 0 1-8 0Z" />
    <path d="M8 4.8H5.2v1.6A3.2 3.2 0 0 0 8 9.6" />
    <path d="M16 4.8h2.8v1.6a3.2 3.2 0 0 1-2.8 3.2" />
    <path d="M12 11.9v3.4M8.5 20.5h7M10 20.5c0-2 1-3 2-3.6 1 .6 2 1.6 2 3.6" />
  </Svg>
);

export const IconTarget = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.6" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconSearch = (props) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.2 16.2 4 4" />
  </Svg>
);

export const IconSun = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const IconMoon = (props) => (
  <Svg {...props}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Svg>
);

export const IconChevronDown = (props) => (
  <Svg {...props}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconCamera = (props) => (
  <Svg {...props}>
    <rect x="2.8" y="6.5" width="13.4" height="12" rx="3" />
    <path d="m16.2 11.5 4.2-2.6v7.2l-4.2-2.6" />
    <circle cx="8" cy="12.5" r="2" />
  </Svg>
);

export const IconClock = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Svg>
);

export const IconChart = (props) => (
  <Svg {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);

export const IconRefresh = (props) => (
  <Svg {...props}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </Svg>
);

export const IconArrowUpRight = (props) => (
  <Svg {...props}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Svg>
);

export const IconBall = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17M3.5 12h17M5.9 5.9c3.4 3.4 3.4 8.8 0 12.2M18.1 5.9c-3.4 3.4-3.4 8.8 0 12.2" />
  </Svg>
);

export const IconGoal = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m12 7.5 3.8 2.8-1.5 4.5h-4.6L8.2 10.3z" />
    <path d="M12 3.5v4M4.6 9.2l3.6 1.1M19.4 9.2l-3.6 1.1M7.6 19.6l2.1-4.8M16.4 19.6l-2.1-4.8" />
  </Svg>
);

export const IconPuck = (props) => (
  <Svg {...props}>
    <ellipse cx="12" cy="9" rx="8" ry="3.4" />
    <path d="M4 9v4c0 1.9 3.6 3.4 8 3.4s8-1.5 8-3.4V9" />
  </Svg>
);

export const LogoMark = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="sh-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a78bfa" />
        <stop offset="1" stopColor="#5b8cff" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="15" fill="url(#sh-mark)" opacity="0.18" />
    <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#sh-mark)" strokeWidth="1.6" opacity="0.75" />
    <circle cx="16" cy="16" r="5" fill="url(#sh-mark)" />
    <circle cx="16" cy="16" r="1.6" fill="#05070f" />
  </svg>
);

export const IconFootball = (props) => (
  <Svg {...props}>
    <ellipse cx="12" cy="12" rx="9.2" ry="6" transform="rotate(-25 12 12)" />
    <path d="m8.6 15.4 6.8-6.8M10.4 11.9l1.3 1.3M12.6 9.7l1.3 1.3" />
  </Svg>
);

export const IconCricket = (props) => (
  <Svg {...props}>
    <path d="m14.5 3.6 5.9 5.9-8.8 8.8-5.9-5.9z" />
    <path d="m5.7 12.4-2.1 2.1a2.6 2.6 0 0 0 3.7 3.7l2.1-2.1" />
    <circle cx="18.2" cy="18.2" r="2.4" />
  </Svg>
);

export const IconShuttle = (props) => (
  <Svg {...props}>
    <path d="M7 5h10l-2.2 8.4h-5.6z" />
    <path d="M8.4 8.4h7.2M12 13.4v7M9.4 20.4h5.2" />
  </Svg>
);
