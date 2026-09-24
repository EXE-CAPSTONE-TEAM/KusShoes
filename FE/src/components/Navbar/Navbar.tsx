import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import styles from './Navbar.module.css';

interface NavbarProps {
  navigate: (path: string) => void;
  currentPage: 'landing' | 'pricing' | string;
}

export const Navbar: React.FC<NavbarProps> = ({ navigate, currentPage }) => {
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
    const onResize = () => window.innerWidth > 768 && setMenuOpen(false);
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
            Products
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="/products" onClick={(e) => handleSubItemClick(e, '/products')}>
              <div className={styles.subItemTitle}>KusShoes Mobile</div>
              <div className={styles.subItemDesc}>iOS / Android photogrammetry capture app</div>
            </a>
            <a href="/products" onClick={(e) => handleSubItemClick(e, '/products')}>
              <div className={styles.subItemTitle}>KusStudio Desktop</div>
              <div className={styles.subItemDesc}>Windows / macOS 3D sneaker designer</div>
            </a>
          </div>
        </div>

        {/* Workflow Dropdown */}
        <div className={styles.navItem}>
          <a href="#workflow" onClick={(e) => handleScrollLink(e, 'workflow')}>
            Workflow
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="#workflow" onClick={(e) => handleSubItemClick(e, '#workflow')}>
              <div className={styles.subItemTitle}>01. Scan Sneaker</div>
              <div className={styles.subItemDesc}>Capture photos on iOS/Android device</div>
            </a>
            <a href="#workflow" onClick={(e) => handleSubItemClick(e, '#workflow')}>
              <div className={styles.subItemTitle}>02. Cloud Sync</div>
              <div className={styles.subItemDesc}>Process mesh details in our Cloud Vault</div>
            </a>
            <a href="#workflow" onClick={(e) => handleSubItemClick(e, '#workflow')}>
              <div className={styles.subItemTitle}>03. Customize</div>
              <div className={styles.subItemDesc}>Load synced model into desktop studio</div>
            </a>
          </div>
        </div>

        {/* Community / Social Proof Dropdown */}
        <div className={styles.navItem}>
          <a href="#social-proof" onClick={(e) => handleScrollLink(e, 'social-proof')}>
            Community
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="#social-proof" onClick={(e) => handleSubItemClick(e, '#social-proof')}>
              <div className={styles.subItemTitle}>Designs Created</div>
              <div className={styles.subItemDesc}>Custom sneaker projects built with KusShoes</div>
            </a>
            <a href="#social-proof" onClick={(e) => handleSubItemClick(e, '#social-proof')}>
              <div className={styles.subItemTitle}>Sneakers Scanned</div>
              <div className={styles.subItemDesc}>Real pairs turned into 3D models</div>
            </a>
            <a href="#social-proof" onClick={(e) => handleSubItemClick(e, '#social-proof')}>
              <div className={styles.subItemTitle}>Active Creators</div>
              <div className={styles.subItemDesc}>Sneakerheads designing on KusShoes today</div>
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
            Pricing
          </a>
        </div>

        {/* Resources Dropdown */}
        <div className={styles.navItem}>
          <a href="/pricing" onClick={(e) => { e.preventDefault(); navigate('/pricing'); }}>
            Resources
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="/pricing" onClick={(e) => handleSubItemClick(e, '/pricing')}>
              <div className={styles.subItemTitle}>Help Center</div>
              <div className={styles.subItemDesc}>Documentation, tutorials & user guides</div>
            </a>
            <a href="/pricing" onClick={(e) => handleSubItemClick(e, '/pricing')}>
              <div className={styles.subItemTitle}>Community</div>
              <div className={styles.subItemDesc}>Review customized models shared by creators</div>
            </a>
            <a href="/pricing" onClick={(e) => handleSubItemClick(e, '/pricing')}>
              <div className={styles.subItemTitle}>Developer API</div>
              <div className={styles.subItemDesc}>Integrate scanning algorithms into your platform</div>
            </a>
          </div>
        </div>
      </nav>
      <div className={styles.navActions}>
        <button 
          className={styles.themeToggleBtn} 
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme mode"
        >
          {theme === 'dark' ? <Sun className={styles.themeIcon} size={18} /> : <Moon className={styles.themeIcon} size={18} />}
        </button>
        <button className={styles.loginLink} onClick={() => navigate('/login')}>
          Sign In
        </button>
        <button className={`btn-neon-orange ${styles.registerBtn}`} onClick={() => navigate('/login')}>
          Register
        </button>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
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
              aria-label="Main menu"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
            >
              <a href="/products" className={currentPage === 'products' ? styles.mobileActive : ''} onClick={(e) => { e.preventDefault(); goFromMenu('/products'); }}>Products</a>
              <a href="#workflow" onClick={(e) => { e.preventDefault(); goFromMenu('#workflow'); }}>Workflow</a>
              <a href="#features" onClick={(e) => { e.preventDefault(); goFromMenu('#features'); }}>Features</a>
              <a href="/pricing" className={currentPage === 'pricing' ? styles.mobileActive : ''} onClick={(e) => { e.preventDefault(); goFromMenu('/pricing'); }}>Pricing</a>
              <div className={styles.mobileActions}>
                <button type="button" className="btn-outline" onClick={() => goFromMenu('/login')}>Sign In</button>
                <button type="button" className="btn-neon-orange" onClick={() => goFromMenu('/login')}>Register</button>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};
