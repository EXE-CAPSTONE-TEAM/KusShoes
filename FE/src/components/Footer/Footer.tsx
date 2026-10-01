import React from 'react';
import { Instagram, Github, Youtube, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { openCookieSettings } from '../../analytics';
import styles from './Footer.module.css';

interface FooterProps {
  navigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ navigate }) => {
  const { t } = useTranslation('common');
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
              src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.webp' : '/KusShoes_Logo_cropped.webp'}
              alt="KusShoes"
              width={450}
              height={140}
              loading="lazy"
              className={styles.logoImage}
            />
          </div>
          <p className={styles.footerBrandDesc}>{t('footer.tagline')}</p>
        </div>

        {/* Col 2: Products */}
        <div className={styles.footerLinkCol}>
          <h3>{t('footer.productsHeading')}</h3>
          <a href="#products" onClick={(e) => handleScrollLink(e, 'products')}>{t('footer.scanner')}</a>
          <a href="#products" onClick={(e) => handleScrollLink(e, 'products')}>{t('footer.studioClient')}</a>
          <a href="/pricing" onClick={handlePricingClick}>{t('footer.cloudPackages')}</a>
        </div>

        {/* Col 3: Resources */}
        <div className={styles.footerLinkCol}>
          <h3>{t('footer.resourcesHeading')}</h3>
          <a href="#docs" onClick={(e) => { e.preventDefault(); toast(t('footer.toastDocsComingSoon'), 'info'); }}>{t('footer.documentation')}</a>
          <a href="#about" onClick={(e) => { e.preventDefault(); toast(t('footer.toastAboutComingSoon'), 'info'); }}>{t('footer.developerTeam')}</a>
          <a href="#releases" onClick={(e) => { e.preventDefault(); toast(t('footer.toastReleasesComingSoon'), 'info'); }}>{t('footer.releaseNotes')}</a>
        </div>

        {/* Col 4: Support & Security */}
        <div className={styles.footerLinkCol}>
          <h3>{t('footer.supportHeading')}</h3>
          <a href="/terms" onClick={(e) => { e.preventDefault(); navigate('/terms'); }}>{t('footer.terms')}</a>
          <a href="/privacy" onClick={(e) => { e.preventDefault(); navigate('/privacy'); }}>{t('footer.privacy')}</a>
          <a href="/pricing" onClick={handlePricingClick}>{t('footer.faqs')}</a>
          <a href="#cookie-settings" onClick={(e) => { e.preventDefault(); openCookieSettings(); }}>{t('cookieConsent.settingsLink')}</a>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className={styles.footerBottom}>
        <span>{t('footer.copyright')}</span>
        
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
