import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminReports, AdminApiError } from '../../../api/adminClient';
import { ThreeDotsBlockLoader } from '../../../components/Admin/ThreeDotsLoader';
import { useToast } from '../../../context/ToastContext';
import type { ReportCatalogue, ReportFormat, ReportSpec } from '../../../types/admin';
import shared from '../admin-shared.module.css';
import styles from './AdminReports.module.css';

const DAY_MS = 86_400_000;

/** Local calendar date as YYYY-MM-DD (toISOString would shift it to UTC). */
const toIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const daysBetween = (from: string, to: string): number =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS) + 1;

const lastNDays = (n: number, today: Date): [string, string] => [
  toIso(new Date(today.getTime() - (n - 1) * DAY_MS)),
  toIso(today),
];

type PresetId = '7' | '30' | '90' | 'this-month' | 'last-month';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: '7', label: '7 ngày' },
  { id: '30', label: '30 ngày' },
  { id: '90', label: '90 ngày' },
  { id: 'this-month', label: 'Tháng này' },
  { id: 'last-month', label: 'Tháng trước' },
];

const presetRange = (id: PresetId, today: Date): [string, string] => {
  if (id === 'this-month') return [toIso(new Date(today.getFullYear(), today.getMonth(), 1)), toIso(today)];
  if (id === 'last-month') {
    return [
      toIso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      toIso(new Date(today.getFullYear(), today.getMonth(), 0)),
    ];
  }
  return lastNDays(Number(id), today);
};

const FORMAT_LABEL: Record<ReportFormat, string> = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

export const AdminReports: React.FC = () => {
  const { toast } = useToast();
  const today = useMemo(() => new Date(), []);
  const [initialFrom, initialTo] = useMemo(() => lastNDays(30, today), [today]);

  const [catalogue, setCatalogue] = useState<ReportCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const [activeDomain, setActiveDomain] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [downloading, setDownloading] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCatalogue(await adminReports.catalogue());
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : 'Không thể tải danh mục báo cáo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = normalize(query.trim());
  const visibleDomains = useMemo(() => {
    if (!catalogue) return [];
    return catalogue.domains
      .filter((d) => activeDomain === 'all' || d.key === activeDomain)
      .map((d) => ({
        ...d,
        reports: d.reports.filter(
          (r) => !needle || normalize(`${r.title} ${r.description} ${r.id}`).includes(needle),
        ),
      }))
      .filter((d) => d.reports.length > 0);
  }, [catalogue, activeDomain, needle]);

  const visibleReports = useMemo(() => visibleDomains.flatMap((d) => d.reports), [visibleDomains]);
  // The shared range only matters when at least one visible report is date-scoped.
  const datesDisabled = visibleReports.length > 0 && visibleReports.every((r) => !r.date_scoped);
  const rangeDays = daysBetween(dateFrom, dateTo);
  const rangeInvalid = !dateFrom || !dateTo || !(rangeDays >= 1);

  const activePreset = PRESETS.find((p) => {
    const [f, t] = presetRange(p.id, today);
    return f === dateFrom && t === dateTo;
  })?.id;

  const download = async (report: ReportSpec, format: ReportFormat) => {
    const key = `${report.id}.${format}`;
    setDownloading((prev) => new Set(prev).add(key));
    try {
      await adminReports.download(
        report.id,
        format,
        report.date_scoped ? { date_from: dateFrom, date_to: dateTo } : {},
      );
      toast(`Đã tạo và tải báo cáo ${report.title} (${FORMAT_LABEL[format]}).`, 'success');
    } catch (caught) {
      toast(caught instanceof AdminApiError ? caught.message : 'Không thể tạo báo cáo.', 'error');
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const blockReason = (report: ReportSpec): string | null => {
    if (report.locked) return 'Báo cáo chỉ dành cho quản trị viên.';
    if (!report.date_scoped) return null;
    if (rangeInvalid) return 'Khoảng ngày không hợp lệ.';
    if (report.max_range_days > 0 && rangeDays > report.max_range_days) {
      return `Khoảng ngày tối đa ${report.max_range_days} ngày cho báo cáo này.`;
    }
    return null;
  };

  const totalCount = catalogue?.domains.reduce((n, d) => n + d.reports.length, 0) ?? 0;

  return (
    <div className={shared.page}>
      <div className={styles.container}>
        <header>
          <h1 className={styles.title}>Trung tâm báo cáo</h1>
          <p className={styles.subtitle}>
            Xuất báo cáo CSV, Excel hoặc PDF theo từng nhóm nghiệp vụ. Dữ liệu đã loại tài khoản nội bộ; mỗi lượt xuất được ghi nhật ký.
            {catalogue ? ` Tối đa ${catalogue.max_rows.toLocaleString('vi-VN')} dòng mỗi file.` : ''}
          </p>
        </header>

        <section className={styles.dateBar} aria-label="Khoảng ngày báo cáo">
          <div className={styles.dateInputs}>
            <label className={styles.dateLabel}>
              Từ ngày
              <input
                type="date"
                className={styles.dateField}
                value={dateFrom}
                max={dateTo || undefined}
                disabled={datesDisabled}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Từ ngày"
              />
            </label>
            <label className={styles.dateLabel}>
              Đến ngày
              <input
                type="date"
                className={styles.dateField}
                value={dateTo}
                min={dateFrom || undefined}
                disabled={datesDisabled}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Đến ngày"
              />
            </label>
            {!rangeInvalid && !datesDisabled && <span className={styles.daysPill}>{rangeDays} ngày</span>}
          </div>
          <div className={styles.presets}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.presetBtn} ${activePreset === p.id ? styles.presetActive : ''}`}
                disabled={datesDisabled}
                onClick={() => {
                  const [f, t] = presetRange(p.id, today);
                  setDateFrom(f);
                  setDateTo(t);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {datesDisabled && (
            <p className={styles.dateNote}>Các báo cáo đang hiển thị là ảnh chụp hiện tại, không áp dụng khoảng ngày.</p>
          )}
        </section>

        {loading && <ThreeDotsBlockLoader text="Đang tải danh mục báo cáo..." minHeight={200} />}

        {!loading && error && (
          <div className={shared.errorState}>
            <span className={shared.errorMessage}>{error}</span>
            <button type="button" className={shared.retryBtn} onClick={() => void load()}>Thử tải lại</button>
          </div>
        )}

        {!loading && !error && catalogue && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.tabs} role="tablist" aria-label="Nhóm báo cáo">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDomain === 'all'}
                  className={`${styles.tab} ${activeDomain === 'all' ? styles.tabActive : ''}`}
                  onClick={() => setActiveDomain('all')}
                >
                  Tất cả <span className={styles.tabCount}>{totalCount}</span>
                </button>
                {catalogue.domains.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    role="tab"
                    aria-selected={activeDomain === d.key}
                    className={`${styles.tab} ${activeDomain === d.key ? styles.tabActive : ''}`}
                    onClick={() => setActiveDomain(d.key)}
                  >
                    {d.label} <span className={styles.tabCount}>{d.reports.length}</span>
                  </button>
                ))}
              </div>
              <input
                type="search"
                className={styles.search}
                placeholder="Tìm báo cáo..."
                aria-label="Tìm báo cáo"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {visibleDomains.length === 0 && (
              <div className={shared.emptyState}>
                {totalCount === 0 ? 'Chưa có báo cáo nào khả dụng.' : 'Không tìm thấy báo cáo phù hợp.'}
              </div>
            )}

            {visibleDomains.map((domain) => (
              <section key={domain.key} className={styles.domain} aria-label={domain.label}>
                <h2 className={styles.domainTitle}>{domain.label}</h2>
                <div className={styles.grid}>
                  {domain.reports.map((report) => {
                    const reason = blockReason(report);
                    return (
                      <article key={report.id} className={styles.card} data-testid={`report-${report.id}`}>
                        <div className={styles.cardHead}>
                          <h3 className={styles.cardTitle}>{report.title}</h3>
                          {report.sensitive && (
                            <span className={report.locked ? styles.badgeLocked : styles.badgeAdmin}>
                              {report.locked ? 'Bị khóa · Chỉ admin' : 'Chỉ admin'}
                            </span>
                          )}
                          {!report.date_scoped && <span className={styles.badgeSnapshot}>Ảnh chụp hiện tại</span>}
                        </div>
                        <p className={styles.cardDesc}>{report.description}</p>
                        <ul className={styles.chips} aria-label="Các cột">
                          {report.columns.map((c) => (
                            <li key={c.label} className={styles.chip}>{c.label}</li>
                          ))}
                        </ul>
                        {reason && <p className={styles.reason}>{reason}</p>}
                        <div className={styles.actions}>
                          {report.formats.map((format) => {
                            const busy = downloading.has(`${report.id}.${format}`);
                            return (
                              <button
                                key={format}
                                type="button"
                                className={styles.exportBtn}
                                disabled={busy || reason !== null}
                                title={reason ?? `Tải ${report.title} (${FORMAT_LABEL[format]})`}
                                onClick={() => void download(report, format)}
                              >
                                {busy ? 'Đang tạo...' : FORMAT_LABEL[format]}
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
