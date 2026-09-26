import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EdgeArt, type EdgeArtVariant } from './EdgeArt';

afterEach(cleanup);

const VARIANTS: EdgeArtVariant[] = ['hero', 'products', 'gallery', 'workflow'];

describe('EdgeArt', () => {
  it.each(VARIANTS)('renders a light and a dark image on both edges for %s', (variant) => {
    const { container } = render(<EdgeArt variant={variant} />);
    const imgs = container.querySelectorAll('img');

    expect(imgs).toHaveLength(4);
    imgs.forEach((img) => expect(img.getAttribute('src')).toBeTruthy());
  });

  it('is hidden from assistive technology and uses empty alt text', () => {
    const { container } = render(<EdgeArt variant="workflow" />);
    const layer = container.firstElementChild as HTMLElement;

    expect(layer).toHaveAttribute('aria-hidden', 'true');
    container.querySelectorAll('img').forEach((img) => expect(img).toHaveAttribute('alt', ''));
  });

  it('loads the hero art eagerly and section art lazily', () => {
    const { container, rerender } = render(<EdgeArt variant="hero" />);
    container
      .querySelectorAll('img')
      .forEach((img) => expect(img).toHaveAttribute('loading', 'eager'));

    rerender(<EdgeArt variant="products" />);
    container
      .querySelectorAll('img')
      .forEach((img) => expect(img).toHaveAttribute('loading', 'lazy'));
  });

  it('merges an extra className onto the layer', () => {
    const { container } = render(<EdgeArt variant="gallery" className="extra" />);
    expect(container.firstElementChild).toHaveClass('extra');
  });
});
