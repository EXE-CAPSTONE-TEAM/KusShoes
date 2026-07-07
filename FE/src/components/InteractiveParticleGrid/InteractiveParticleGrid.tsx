import React, { useRef, useEffect } from 'react';
import styles from './InteractiveParticleGrid.module.css';

interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}

const TRAIL_DURATION = 750;
const MIN_DIST = 3;

export const InteractiveParticleGrid: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width  = canvas.width  = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const trail: TrailPoint[] = [];

    const handleResize = () => {
      width  = canvas.width  = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const last = trail[trail.length - 1];
      if (last) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) return;
      }
      trail.push({ x: e.clientX, y: e.clientY, timestamp: Date.now() });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    // Draw one smooth bezier segment with dual-pass brush look
    const drawSegment = (
      x0: number, y0: number,
      cx: number, cy: number,
      x1: number, y1: number,
      progress: number,
      speed: number
    ) => {
      const speedFactor = Math.min(speed / 55, 1);
      const coreWidth   = Math.max(1, (2 + progress * 8) * (1 - speedFactor * 0.55));
      const alpha       = progress * 0.92;

      // Soft outer glow (brush bleed)
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.strokeStyle = `rgba(255, 90, 54, ${alpha * 0.28})`;
      ctx.lineWidth   = coreWidth * 3;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.shadowColor = 'rgba(255, 90, 54, 0.35)';
      ctx.shadowBlur  = 16 * progress;
      ctx.stroke();

      // Sharp inner core
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.strokeStyle = `rgba(255, 90, 54, ${alpha})`;
      ctx.lineWidth   = coreWidth;
      ctx.shadowBlur  = 0;
      ctx.stroke();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.shadowBlur = 0;

      const now = Date.now();

      // Drop expired points
      while (trail.length > 0 && now - trail[0].timestamp > TRAIL_DURATION) {
        trail.shift();
      }

      if (trail.length >= 2) {
        // Smooth bezier segments via midpoint technique
        for (let i = 1; i < trail.length - 1; i++) {
          const prev = trail[i - 1];
          const curr = trail[i];
          const next = trail[i + 1];

          // Midpoints are segment endpoints → curve through curr as control point
          const x0 = (prev.x + curr.x) / 2;
          const y0 = (prev.y + curr.y) / 2;
          const x1 = (curr.x + next.x) / 2;
          const y1 = (curr.y + next.y) / 2;

          const progress = Math.max(0, 1 - (now - curr.timestamp) / TRAIL_DURATION);

          // Use prev→next distance as speed proxy
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          const speed = Math.sqrt(dx * dx + dy * dy);

          drawSegment(x0, y0, curr.x, curr.y, x1, y1, progress, speed);
        }

        // Final segment: midpoint of last two → actual last point
        const n    = trail.length;
        const prev = trail[n - 2];
        const last = trail[n - 1];
        const x0   = (prev.x + last.x) / 2;
        const y0   = (prev.y + last.y) / 2;
        const progress = Math.max(0, 1 - (now - last.timestamp) / TRAIL_DURATION);
        const dx   = last.x - prev.x;
        const dy   = last.y - prev.y;
        const speed = Math.sqrt(dx * dx + dy * dy);

        drawSegment(x0, y0, last.x, last.y, last.x, last.y, progress, speed);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} />;
};
