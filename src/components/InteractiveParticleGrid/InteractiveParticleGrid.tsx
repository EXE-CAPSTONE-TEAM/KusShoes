import React, { useRef, useEffect } from 'react';
import styles from './InteractiveParticleGrid.module.css';

export const InteractiveParticleGrid: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    // Handle resize
    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initParticles();
    };

    window.addEventListener('resize', handleResize);

    // Track mouse coordinates
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Particle structure
    interface Particle {
      baseX: number;
      baseY: number;
      x: number;
      y: number;
      size: number;
    }

    let particles: Particle[] = [];
    const spacing = 32; // Grid spacing in pixels

    const initParticles = () => {
      particles = [];
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;
          particles.push({
            baseX: x,
            baseY: y,
            x: x,
            y: y,
            size: 1.2
          });
        }
      }
    };

    initParticles();

    const hoverRadius = 150;
    const maxDisplacement = 12; // Repulsion force distance
    const ease = 0.1;

    // Detect theme class on root element
    const isLightTheme = () => {
      return document.documentElement.getAttribute('data-theme') === 'light';
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const mouse = mouseRef.current;
      const lightMode = isLightTheme();

      // Base default color for inactive dots
      const defaultDotColor = lightMode 
        ? 'rgba(18, 18, 21, 0.08)' 
        : 'rgba(255, 255, 255, 0.07)';

      particles.forEach((p) => {
        let targetX = p.baseX;
        let targetY = p.baseY;
        let color = defaultDotColor;
        let size = p.size;

        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < hoverRadius) {
            const force = (hoverRadius - distance) / hoverRadius; // 0 to 1
            
            // Repulsion math (push away from pointer)
            targetX = p.baseX + (dx / (distance || 1)) * force * maxDisplacement;
            targetY = p.baseY + (dy / (distance || 1)) * force * maxDisplacement;

            // Expand size slightly
            size = p.size + force * 1.5;

            // Generate gorgeous dynamic gradient color (transitioning from blue to purple/pink)
            const angle = Math.atan2(dy, dx);
            const hue = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 120) + 200; // range 200 (blue) to 320 (purple/pink)
            const alpha = (force * 0.75).toFixed(2);
            color = `hsla(${hue}, 85%, 60%, ${alpha})`;
          }
        }

        // Apply easing transition
        p.x += (targetX - p.x) * ease;
        p.y += (targetY - p.y) * ease;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} />;
};
