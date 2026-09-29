import React from 'react';
import { useTranslation } from 'react-i18next';
import { Navbar } from '../../components/Navbar/Navbar';
import { Footer } from '../../components/Footer/Footer';
import {
  LEGAL_DOCS,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  legalLang,
  type LegalDocKey,
} from '../../content/legal';
import styles from './LegalPage.module.css';

interface LegalPageProps {
  doc: LegalDocKey;
  navigate: (path: string) => void;
}

/** /privacy and /terms: the documents users accept at sign-up (LEGAL_VERSION). */
export const LegalPage: React.FC<LegalPageProps> = ({ doc, navigate }) => {
  const { i18n } = useTranslation();
  const lang = legalLang(i18n.resolvedLanguage ?? i18n.language);
  const content = LEGAL_DOCS[lang][doc];
  const other = doc === 'privacy' ? 'terms' : 'privacy';

  return (
    <div className={styles.page}>
      <Navbar navigate={navigate} currentPage={doc} />
      <main className={styles.main}>
        <article className={styles.article}>
          <header className={styles.header}>
            <h1>{content.title}</h1>
            <p className={styles.meta}>
              {lang === 'vi' ? 'Phiên bản' : 'Version'} {LEGAL_VERSION} ·{' '}
              {lang === 'vi' ? 'Hiệu lực từ' : 'Effective'} {LEGAL_EFFECTIVE_DATE[lang]}
            </p>
            <p>{content.intro}</p>
          </header>

          <nav className={styles.toc} aria-label={lang === 'vi' ? 'Mục lục' : 'Contents'}>
            <ol>
              {content.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          {content.sections.map((section) => (
            <section key={section.id} id={section.id} className={styles.section}>
              <h2>{section.title}</h2>
              {section.body.map((block) =>
                Array.isArray(block) ? (
                  <ul key={block[0]}>
                    {block.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={block}>{block}</p>
                ),
              )}
            </section>
          ))}

          <p className={styles.seeAlso}>
            <a
              href={`/${other}`}
              onClick={(event) => {
                event.preventDefault();
                navigate(`/${other}`);
              }}
            >
              {LEGAL_DOCS[lang][other].title} →
            </a>
          </p>
        </article>
      </main>
      <Footer navigate={navigate} />
    </div>
  );
};
