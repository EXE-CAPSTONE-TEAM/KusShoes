import React, { useState, useEffect } from 'react';
import styles from './AnimatedPrice.module.css';

interface AnimatedPriceProps {
  price: number;
  formatPrice: (val: number) => string;
}

export const AnimatedPrice: React.FC<AnimatedPriceProps> = ({ price, formatPrice }) => {
  const [displayPrice, setDisplayPrice] = useState(price);
  const [isStriking, setIsStriking] = useState(false);

  useEffect(() => {
    if (price === displayPrice) return;

    setIsStriking(true);
    
    // Change price at exactly 50% of the animation (300ms)
    const changeTimeout = setTimeout(() => {
      setDisplayPrice(price);
    }, 300);

    // Reset striking state after animation finishes (600ms)
    const resetTimeout = setTimeout(() => {
      setIsStriking(false);
    }, 600);

    return () => {
      clearTimeout(changeTimeout);
      clearTimeout(resetTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price]);

  return (
    <div className={styles.priceWrapper}>
      <span className={`${styles.priceNum} ${isStriking ? styles.strikeActive : ''}`}>
        {displayPrice === 0 ? 'Free' : formatPrice(displayPrice)}
      </span>
      {isStriking && <div className={styles.strikeLine} />}
    </div>
  );
};
