"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
  staggerDelay?: number;
};

export function FadeIn({ children, className }: Props) {
  return <div className={className}>{children}</div>;
}

export function StaggerContainer({ children, className }: Props) {
  return <div className={className}>{children}</div>;
}

export function StaggerItem({ children, className }: Props) {
  return <div className={className}>{children}</div>;
}
