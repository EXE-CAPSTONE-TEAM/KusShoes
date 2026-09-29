/**
 * Terms of Service and Privacy Policy. The documents themselves are data in legal/vi.json and
 * legal/en.json (Vietnamese prevails). Accepting them is recorded in consent_records with
 * LEGAL_VERSION (BE app/policy.py); bump both and users are asked to agree again.
 *
 * Every factual statement in the documents mirrors the running system; update both together:
 * - retention: BE app/policy.py (30-day account / project restore), login history 90 days (BR-18),
 *   scan videos deleted from our storage once KIRI accepts them (ar-ai-exe kiri_pipeline.py);
 * - processors and regions: Neon (ap-southeast-1), GCP VM (asia-southeast1), Cloudflare R2,
 *   Vercel, KIRI Engine, Google Sign-In (openid email profile only), Gmail SMTP, PayOS;
 * - billing: no stored cards, no auto-renewal (billing_service.py), scan credits valid 12 months.
 */
import en from './legal/en.json';
import vi from './legal/vi.json';

export const LEGAL_VERSION = '1.0';
export const LEGAL_EFFECTIVE_DATE = { vi: '29/09/2026', en: '29 September 2026' };
export const LEGAL_CONTACT_EMAIL = 'kusshoes@gmail.com';

export type LegalDocKey = 'privacy' | 'terms';
export type LegalLang = 'vi' | 'en';

export type LegalSection = {
  id: string;
  title: string;
  /** Paragraphs; a paragraph that is an array renders as a bullet list. */
  body: Array<string | string[]>;
};

export type LegalDoc = {
  title: string;
  intro: string;
  sections: LegalSection[];
};

export const LEGAL_DOCS: Record<LegalLang, Record<LegalDocKey, LegalDoc>> = { vi, en };

/** English only when the UI language is English; Vietnamese (the prevailing version) otherwise. */
export function legalLang(language: string | undefined): LegalLang {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'vi';
}
