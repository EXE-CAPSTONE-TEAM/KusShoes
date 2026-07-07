import React from 'react';
import { Instagram, Github, Youtube, MessageSquare } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import styles from './Footer.module.css';

interface FooterProps {
  navigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ navigate }) => {
  const { theme } = useTheme();
  const { toast } = useToast();

  const handlePricingClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate('/pricing');
  };

  const handleScrollLink = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    navigate('/');
    setTimeout(() => {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.footerGrid}>
        {/* Col 1: Brand */}
        <div className={styles.footerBrandBlock}>
          <div className={styles.navBrand} onClick={() => navigate('/')}>
            <img
              src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
              alt="KusShoes"
              className={styles.logoImage}
            />
          </div>
          <p className={styles.footerBrandDesc}>"Shape your shoes, show your style."</p>
        </div>

        {/* Col 2: Products */}
        <div className={styles.footerLinkCol}>
          <h4>Products</h4>
          <a href="#products" onClick={(e) => handleScrollLink(e, 'products')}>KusShoes Scanner</a>
          <a href="#products" onClick={(e) => handleScrollLink(e, 'products')}>KusStudio 3D Client</a>
          <a href="/pricing" onClick={handlePricingClick}>Cloud Packages</a>
        </div>

        {/* Col 3: Resources */}
        <div className={styles.footerLinkCol}>
          <h4>Resources</h4>
          <a href="#docs" onClick={(e) => { e.preventDefault(); toast('Documentation page coming soon', 'info'); }}>Documentation</a>
          <a href="#about" onClick={(e) => { e.preventDefault(); toast('About the team page coming soon', 'info'); }}>Developer Team</a>
          <a href="#releases" onClick={(e) => { e.preventDefault(); toast('Release notes coming soon', 'info'); }}>Release Notes</a>
        </div>

        {/* Col 4: Support & Security */}
        <div className={styles.footerLinkCol}>
          <h4>Support & Security</h4>
          <a href="#terms" onClick={(e) => { e.preventDefault(); toast('Terms of Service page coming soon', 'info'); }}>Terms of Service</a>
          <a href="#privacy" onClick={(e) => { e.preventDefault(); toast('Privacy Policy page coming soon', 'info'); }}>Privacy Policy</a>
          <a href="/pricing" onClick={handlePricingClick}>FAQs</a>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className={styles.footerBottom}>
        <span>© 2026 KusShoes Ecosystem. All rights reserved.</span>
        
        {/* Social Icons */}
        <div className={styles.socialsList}>
          <a href="https://instagram.com" target="_blank" rel="noreferrer" className={styles.socialIcon} aria-label="Instagram">
            <Instagram size={18} />
          </a>
          <a href="https://discord.com" target="_blank" rel="noreferrer" className={styles.socialIcon} aria-label="Discord">
            <MessageSquare size={18} />
          </a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className={styles.socialIcon} aria-label="GitHub">
            <Github size={18} />
          </a>
          <a href="https://youtube.com" target="_blank" rel="noreferrer" className={styles.socialIcon} aria-label="YouTube">
            <Youtube size={18} />
          </a>
        </div>
      </div>
    </footer>
  );
};
