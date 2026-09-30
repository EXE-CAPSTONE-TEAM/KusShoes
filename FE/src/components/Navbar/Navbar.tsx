import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher';
import styles from './Navbar.module.css';

interface NavbarProps {
  navigate: (path: string) => void;
  currentPage: 'landing' | 'pricing' | string;
}

export const Navbar: React.FC<NavbarProps> = ({ navigate, currentPage }) => {
  const { t } = useTranslation('common');
  const { theme, toggleTheme } = useTheme();
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastScrollY = useRef(0);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 80 && !menuOpenRef.current) {
        setHidden(true);
      } else {
        setHidden(false);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  
  const handleScrollLink = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    if (currentPage !== 'landing') {
      e.preventDefault();
      // Navigate to home first
      navigate('/');
      // Wait a brief moment for the Landing view to mount, then scroll
      setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    }
    // If we are already on landing, standard href anchor #targetId will handle the scroll automatically.
  };

  const goToPath = (path: string) => {
    if (path.startsWith('#')) {
      const targetId = path.substring(1);
      if (currentPage !== 'landing') {
        navigate('/');
        setTimeout(() => {
          const element = document.getElementById(targetId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        }, 150);
      } else {
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }
    } else {
      navigate(path);
    }
  };

  const handleSubItemClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    goToPath(path);
  };

  const closeMenu = () => setMenuOpen(false);
  const goFromMenu = (path: string) => {
    closeMenu();
    goToPath(path);
  };

  // Mobile menu: lock page scroll, close on Escape and when the viewport grows past the phone layout
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    const onResize = () => window.innerWidth > 1024 && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  return (
    <header className={`${styles.navbar} ${hidden ? styles.navbarHidden : ''} glass-panel`}>
      <div className={styles.navBrand} onClick={() => navigate('/')}>
        <img
          src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
          alt="KusShoes"
          className={styles.logoImage}
        />
      </div>
      <nav className={styles.navLinks}>
        {/* Products Dropdown */}
        <div className={styles.navItem}>
          <a 
            href="/products" 
            onClick={(e) => { 
              e.preventDefault(); 
              navigate('/products'); 
            }}
            className={currentPage === 'products' ? styles.activeLink : ''}
          >
            {t('nav.products')}
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="/products" onClick={(e) => handleSubItemClick(e, '/products')}>
              <div className={styles.subItemTitle}>{t('nav.productsMobileTitle')}</div>
              <div className={styles.subItemDesc}>{t('nav.productsMobileDesc')}</div>
            </a>
            <a href="/products" onClick={(e) => handleSubItemClick(e, '/products')}>
              <div className={styles.subItemTitle}>{t('nav.productsDesktopTitle')}</div>
              <div className={styles.subItemDesc}>{t('nav.productsDesktopDesc')}</div>
            </a>
          </div>
        </div>

        {/* Workflow Dropdown */}
        <div className={styles.navItem}>
          <a href="#workflow" onClick={(e) => handleScrollLink(e, 'workflow')}>
            {t('nav.workflow')}
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="#workflow" onClick={(e) => handleSubItemClick(e, '#workflow')}>
              <div className={styles.subItemTitle}>{t('nav.workflowStep1Title')}</div>
              <div className={styles.subItemDesc}>{t('nav.workflowStep1Desc')}</div>
            </a>
            <a href="#workflow" onClick={(e) => handleSubItemClick(e, '#workflow')}>
              <div className={styles.subItemTitle}>{t('nav.workflowStep2Title')}</div>
              <div className={styles.subItemDesc}>{t('nav.workflowStep2Desc')}</div>
            </a>
            <a href="#workflow" onClick={(e) => handleSubItemClick(e, '#workflow')}>
              <div className={styles.subItemTitle}>{t('nav.workflowStep3Title')}</div>
              <div className={styles.subItemDesc}>{t('nav.workflowStep3Desc')}</div>
            </a>
          </div>
        </div>

        {/* Community / Social Proof Dropdown */}
        <div className={styles.navItem}>
          <a href="#social-proof" onClick={(e) => handleScrollLink(e, 'social-proof')}>
            {t('nav.community')}
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="#social-proof" onClick={(e) => handleSubItemClick(e, '#social-proof')}>
              <div className={styles.subItemTitle}>{t('nav.communityDesignsTitle')}</div>
              <div className={styles.subItemDesc}>{t('nav.communityDesignsDesc')}</div>
            </a>
            <a href="#social-proof" onClick={(e) => handleSubItemClick(e, '#social-proof')}>
              <div className={styles.subItemTitle}>{t('nav.communityScannedTitle')}</div>
              <div className={styles.subItemDesc}>{t('nav.communityScannedDesc')}</div>
            </a>
            <a href="#social-proof" onClick={(e) => handleSubItemClick(e, '#social-proof')}>
              <div className={styles.subItemTitle}>{t('nav.communityCreatorsTitle')}</div>
              <div className={styles.subItemDesc}>{t('nav.communityCreatorsDesc')}</div>
            </a>
          </div>
        </div>

        {/* Pricing Link */}
        <div className={styles.navItem}>
          <a
            href="/pricing"
            onClick={(e) => {
              e.preventDefault();
              navigate('/pricing');
            }}
            className={currentPage === 'pricing' ? styles.activeLink : ''}
          >
            {t('nav.pricing')}
          </a>
        </div>

        {/* Resources Dropdown */}
        <div className={styles.navItem}>
          <a href="/pricing" onClick={(e) => { e.preventDefault(); navigate('/pricing'); }}>
            {t('nav.resources')}
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="/pricing" onClick={(e) => handleSubItemClick(e, '/pricing')}>
              <div className={styles.subItemTitle}>{t('nav.resourcesHelpTitle')}</div>
              <div className={styles.subItemDesc}>{t('nav.resourcesHelpDesc')}</div>
            </a>
            <a href="/pricing" onClick={(e) => handleSubItemClick(e, '/pricing')}>
              <div className={styles.subItemTitle}>{t('nav.resourcesCommunityTitle')}</div>
              <div className={styles.subItemDesc}>{t('nav.resourcesCommunityDesc')}</div>
            </a>
            <a href="/pricing" onClick={(e) => handleSubItemClick(e, '/pricing')}>
              <div className={styles.subItemTitle}>{t('nav.resourcesApiTitle')}</div>
              <div className={styles.subItemDesc}>{t('nav.resourcesApiDesc')}</div>
            </a>
          </div>
        </div>
      </nav>
      <div className={styles.navActions}>
        <LanguageSwitcher className={styles.themeToggleBtn} />
        <button
          className={styles.themeToggleBtn}
          onClick={toggleTheme}
          title={theme === 'dark' ? t('nav.toggleThemeLight') : t('nav.toggleThemeDark')}
          aria-label={t('nav.toggleThemeAria')}
        >
          {theme === 'dark' ? <Sun className={styles.themeIcon} size={18} /> : <Moon className={styles.themeIcon} size={18} />}
        </button>
        <button className={styles.loginLink} onClick={() => navigate('/login')}>
          {t('nav.signIn')}
        </button>
        <button className={`btn-neon-orange ${styles.registerBtn}`} onClick={() => navigate('/login')}>
          {t('nav.register')}
        </button>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Portalled: the navbar is transformed, which would otherwise trap a fixed backdrop inside it */}
            {createPortal(
              <motion.div
                className={styles.menuBackdrop}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeMenu}
              />,
              document.body,
            )}
            <motion.nav
              id="mobile-menu"
              className={`${styles.mobileMenu} glass-panel`}
              aria-label={t('nav.mainMenu')}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
            >
              <a href="/products" className={currentPage === 'products' ? styles.mobileActive : ''} onClick={(e) => { e.preventDefault(); goFromMenu('/products'); }}>{t('nav.products')}</a>
              <a href="#workflow" onClick={(e) => { e.preventDefault(); goFromMenu('#workflow'); }}>{t('nav.workflow')}</a>
              <a href="#features" onClick={(e) => { e.preventDefault(); goFromMenu('#features'); }}>{t('nav.features')}</a>
              <a href="/pricing" className={currentPage === 'pricing' ? styles.mobileActive : ''} onClick={(e) => { e.preventDefault(); goFromMenu('/pricing'); }}>{t('nav.pricing')}</a>
              <div className={styles.mobileActions}>
                <LanguageSwitcher className="btn-outline" />
                <button type="button" className="btn-outline" onClick={() => goFromMenu('/login')}>{t('nav.signIn')}</button>
                <button type="button" className="btn-neon-orange" onClick={() => goFromMenu('/login')}>{t('nav.register')}</button>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};
