import React, { useState } from 'react';
import { adminAnalytics } from '../../../../api/adminClient';
import type { Ga4ConnectionTestResponse } from '../../../../types/admin';
import styles from './MarketingTab.module.css';

interface Ga4SetupGuideModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const Ga4SetupGuideModal: React.FC<Ga4SetupGuideModalProps> = ({ onClose, onSuccess }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Ga4ConnectionTestResponse | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await adminAnalytics.testGa4Connection();
      setTestResult(res);
      if (res.connected) {
        onSuccess();
      }
    } catch (err) {
      setTestResult({
        status: 'error',
        connected: false,
        message: err instanceof Error ? err.message : 'Không thể kết nối tới máy chủ.',
        property_id: null,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Hướng dẫn kết nối Google Analytics 4 (Data API)</h3>
            <p className={styles.modalSubtitle}>
              Cung cấp quyền đọc dữ liệu từ Property GA4 về hệ thống quản trị KusShoes
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.guideStep}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepContent}>
              <h4 className={styles.stepHeading}>Tạo Service Account trên Google Cloud</h4>
              <p>
                Truy cập <strong>Google Cloud Console</strong> &gt; <strong>APIs &amp; Services</strong>.
                Bật <strong>Google Analytics Data API</strong> và tạo một <strong>Service Account</strong> mới.
                Tải về khóa dạng <strong>JSON key</strong> (ví dụ: <code>service-account.json</code>).
              </p>
            </div>
          </div>

          <div className={styles.guideStep}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepContent}>
              <h4 className={styles.stepHeading}>Cấp quyền Viewer trong Google Analytics</h4>
              <p>
                Mở <strong>Google Analytics</strong> (Property <code>G-ZB62H02JZW</code>) &gt; <strong>Quản trị</strong> &gt; <strong>Quản lý quyền truy cập tài sản</strong>.
                Thêm email của Service Account vừa tạo với vai trò <strong>Người xem (Viewer)</strong>.
              </p>
            </div>
          </div>

          <div className={styles.guideStep}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepContent}>
              <h4 className={styles.stepHeading}>Cấu hình biến môi trường trên Server</h4>
              <p>
                Mở file <code>BE/.env</code> và thêm:
              </p>
              <pre className={styles.codeSnippet}>
{`GA4_PROPERTY_ID=123456789
GA4_CREDENTIALS_JSON_PATH=/path/to/service-account.json`}
              </pre>
              <p className={styles.stepNote}>
                *Lưu ý: <code>GA4_PROPERTY_ID</code> là chuỗi số 9-10 ký tự trong mục <em>Chi tiết tài sản</em>, không phải Measurement ID (G-XXXXX).
              </p>
            </div>
          </div>

          {testResult && (
            <div
              className={`${styles.resultBox} ${
                testResult.connected ? styles.resultSuccess : styles.resultError
              }`}
            >
              <div className={styles.resultHeader}>
                <strong>{testResult.connected ? '✓ Kết nối thành công' : '⚠ Chưa kết nối được'}</strong>
              </div>
              <p className={styles.resultMsg}>{testResult.message}</p>
              {testResult.property_id && (
                <span className={styles.resultProperty}>
                  Property ID đang cấu hình: {testResult.property_id}
                </span>
              )}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Đóng
          </button>
          <button
            className={styles.testBtn}
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? 'Đang kiểm tra kết nối...' : 'Kiểm tra kết nối ngay'}
          </button>
        </div>
      </div>
    </div>
  );
};
