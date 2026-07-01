import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import styles from './Navbar.module.css';

interface NavbarProps {
  navigate: (path: string) => void;
  currentPage: 'landing' | 'pricing' | string;
}

export const Navbar: React.FC<NavbarProps> = ({ navigate, currentPage }) => {
  const { theme, toggleTheme } = useTheme();
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 80) {
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

  const handleSubItemClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
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

        {/* Features Dropdown */}
        <div className={styles.navItem}>
          <a href="#features" onClick={(e) => handleScrollLink(e, 'features')}>
            Features
          </a>
          <div className={`${styles.dropdownMenu} glass-panel`}>
            <a href="#features" onClick={(e) => handleSubItemClick(e, '#features')}>
              <div className={styles.subItemTitle}>Kiri Reconstruction</div>
              <div className={styles.subItemDesc}>Automated photogrammetry model building</div>
            </a>
            <a href="#features" onClick={(e) => handleSubItemClick(e, '#features')}>
              <div className={styles.subItemTitle}>Secure Cloud Vault</div>
              <div className={styles.subItemDesc}>Accessible sneaker database synced in real-time</div>
            </a>
            <a href="#features" onClick={(e) => handleSubItemClick(e, '#features')}>
              <div className={styles.subItemTitle}>WebGL Studio Editor</div>
              <div className={styles.subItemDesc}>Pro-grade textures, paint brushes and metallic maps</div>
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
        <button className="btn-neon-orange" onClick={() => navigate('/login')}>
          Register
        </button>
      </div>
    </header>
  );
};
