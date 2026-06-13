"use client";

import { useEffect, useState } from "react";

const COLORS = ["#ff2d55", "#ff4d8f", "#8a2be2", "#3b5fff"];

type Particle = {
  id: number;
  size: number;
  left: number;
  bottom: number;
  duration: number;
  delay: number;
  color: string;
  opacity: number;
};
type Star = {
  id: number;
  size: number;
  top: number;
  left: number;
  delay: number;
};

export default function Particles({ count = 24 }: { count?: number }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    // Si el usuario pidió "menos movimiento", no generamos nada (ahorra DOM
    // y trabajo del hilo principal). El CSS además las oculta por si acaso.
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    setParticles(
      Array.from({ length: count }, (_, i) => {
        const size = Math.random() * 2.5 + 0.5;
        return {
          id: i,
          size,
          left: Math.random() * 100,
          bottom: Math.random() * -30 - 5,
          duration: 12 + Math.random() * 18,
          delay: -Math.random() * 20,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          opacity: 0.4 + Math.random() * 0.5,
        };
      }),
    );
    setStars(
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        size: Math.random() * 1.5 + 0.5,
        top: Math.random() * 100,
        left: Math.random() * 100,
        delay: -Math.random() * 4,
      })),
    );
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s) => (
        <span
          key={`s${s.id}`}
          className="star"
          style={{
            width: `${s.size}px`,
            height: `${s.size}px`,
            top: `${s.top}%`,
            left: `${s.left}%`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
      {particles.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            left: `${p.left}%`,
            bottom: `${p.bottom}%`,
            background: p.color,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
