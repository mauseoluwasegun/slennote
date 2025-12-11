import React from "react";
import { useTheme } from "../context/ThemeContext";

interface LogoProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

export function Logo({ size = "medium", className = "" }: LogoProps) {
  const { theme } = useTheme();

  // Size configurations
  const sizeConfig = {
    small: { width: 24, height: 24 },
    medium: { width: 32, height: 32 },
    large: { width: 48, height: 48 },
  };

  const { width, height } = sizeConfig[size];

  // Color scheme based on theme
  const colors = {
    dark: {
      primary: "#4a9eff",
      secondary: "#2d7dd2",
      accent: "#1a5ba8",
      highlight: "#87ceeb",
    },
    light: {
      primary: "#007aff",
      secondary: "#0056cc",
      accent: "#003d99",
      highlight: "#66b3ff",
    },
    tan: {
      primary: "#eb5601",
      secondary: "#c44601",
      accent: "#9d3601",
      highlight: "#ff7733",
    },
    cloud: {
      primary: "#171717",
      secondary: "#404040",
      accent: "#666666",
      highlight: "#999999",
    },
  };

  const currentColors = colors[theme] || colors.light;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      className={`logo ${className}`}
      style={{ flexShrink: 0 }}
    >
      {/* Background folder shape */}
      <defs>
        <linearGradient id={`gradient-${theme}-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={currentColors.primary} />
          <stop offset="50%" stopColor={currentColors.secondary} />
          <stop offset="100%" stopColor={currentColors.accent} />
        </linearGradient>
        <filter id={`shadow-${theme}-${size}`}>
          <feDropShadow dx="2" dy="4" stdDeviation="3" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* Main folder body */}
      <path
        d="M15 25 L15 80 Q15 85 20 85 L80 85 Q85 85 85 80 L85 35 Q85 30 80 30 L45 30 L40 25 Q38 23 35 23 L20 23 Q15 23 15 25 Z"
        fill={`url(#gradient-${theme}-${size})`}
        filter={`url(#shadow-${theme}-${size})`}
      />

      {/* Folder tab */}
      <path
        d="M15 25 L35 25 Q38 25 40 27 L45 32 L75 32 Q80 32 80 27 L80 20 Q80 15 75 15 L45 15 L40 20 Q38 22 35 22 L20 22 Q15 22 15 25 Z"
        fill={currentColors.highlight}
        opacity="0.8"
      />

      {/* Checkmark overlay for "done" concept */}
      <path
        d="M35 50 L45 60 L65 40"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      />

      {/* Subtle highlight on folder edge */}
      <path
        d="M20 30 Q15 30 15 35 L15 75 Q15 80 20 80"
        stroke={currentColors.highlight}
        strokeWidth="1"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

// Text logo component for larger displays
export function TextLogo({ className = "" }: { className?: string }) {
  const { theme } = useTheme();

  return (
    <div className={`text-logo ${className}`}>
      <Logo size="medium" />
      <span className="text-logo-text">SlentNote</span>
    </div>
  );
}