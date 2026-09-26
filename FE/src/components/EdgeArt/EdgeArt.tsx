import React from 'react';
import heroLeft from '../../assets/edge-art/hero-left.png';
import heroLeftDark from '../../assets/edge-art/hero-left-dark.png';
import heroRight from '../../assets/edge-art/hero-right.png';
import heroRightDark from '../../assets/edge-art/hero-right-dark.png';
import productsLeft from '../../assets/edge-art/products-left.png';
import productsLeftDark from '../../assets/edge-art/products-left-dark.png';
import productsRight from '../../assets/edge-art/products-right.png';
import productsRightDark from '../../assets/edge-art/products-right-dark.png';
import galleryLeft from '../../assets/edge-art/gallery-left.png';
import galleryLeftDark from '../../assets/edge-art/gallery-left-dark.png';
import galleryRight from '../../assets/edge-art/gallery-right.png';
import galleryRightDark from '../../assets/edge-art/gallery-right-dark.png';
import workflowLeft from '../../assets/edge-art/workflow-left.png';
import workflowLeftDark from '../../assets/edge-art/workflow-left-dark.png';
import workflowRight from '../../assets/edge-art/workflow-right.png';
import workflowRightDark from '../../assets/edge-art/workflow-right-dark.png';
import styles from './EdgeArt.module.css';

export type EdgeArtVariant = 'hero' | 'products' | 'gallery' | 'workflow';

interface ArtPair {
  light: string;
  dark: string;
}

const ART: Record<EdgeArtVariant, { left: ArtPair; right: ArtPair }> = {
  // Technical drawing of a sneaker | exploded view of the sole layers
  hero: {
    left: { light: heroLeft, dark: heroLeftDark },
    right: { light: heroRight, dark: heroRightDark },
  },
  // Outsole tread pattern | lacing and eyelets
  products: {
    left: { light: productsLeft, dark: productsLeftDark },
    right: { light: productsRight, dark: productsRightDark },
  },
  // Design variations side by side | stitching and a loose lace
  gallery: {
    left: { light: galleryLeft, dark: galleryLeftDark },
    right: { light: galleryRight, dark: galleryRightDark },
  },
  // Camera orbit of a photogrammetry scan | wireframe mesh dissolving into a point cloud
  workflow: {
    left: { light: workflowLeft, dark: workflowLeftDark },
    right: { light: workflowRight, dark: workflowRightDark },
  },
};

const SIDES = ['left', 'right'] as const;

interface EdgeArtProps {
  variant: EdgeArtVariant;
  className?: string;
}

/**
 * Decorative sneaker line art pinned to the left and right edges of the viewport.
 *
 * Drop it as the first child of a section that is `position: relative` (every Landing section
 * already is). The layer is full-bleed (100vw, centred on the section), sits behind the section's
 * content (`z-index: -1` inside the section's stacking context) and hides itself on narrow screens.
 *
 * Both theme variants are rendered; CSS picks one from `[data-theme]` on <html>, so a theme switch
 * never re-renders or re-fetches anything (the hidden, lazy-loaded variant is not downloaded).
 */
export const EdgeArt: React.FC<EdgeArtProps> = ({ variant, className }) => {
  const art = ART[variant];
  const loading = variant === 'hero' ? 'eager' : 'lazy';
  const layerClass = [styles.layer, variant === 'hero' ? styles.hero : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layerClass} aria-hidden="true" data-edge-art={variant}>
      {SIDES.map((side) => (
        <div key={side} className={`${styles.edge} ${styles[side]}`}>
          <img
            className={`${styles.img} ${styles.light}`}
            src={art[side].light}
            alt=""
            loading={loading}
            decoding="async"
            draggable={false}
          />
          <img
            className={`${styles.img} ${styles.dark}`}
            src={art[side].dark}
            alt=""
            loading={loading}
            decoding="async"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
};
