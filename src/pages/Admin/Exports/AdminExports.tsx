import React, { useEffect, useState } from 'react';
import { Select } from '../../../components/Select/Select';
import { adminExports } from '../../../api/adminClient';
import type { AdminExport } from '../../../types/admin';
import shared from '../admin-shared.module.css';

const FORMAT_OPTIONS = [
  { value: 'all', label: 'Tất cả định dạng' },
  { value: 'glb', label: 'GLB' },
  { value: 'obj', label: 'OBJ' },
  { value: 'zip', label: 'ZIP' },
];

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('vi-VN');

export const AdminExports: React.FC = () => {
  const [exports, setExports] = useState<AdminExport[]>([]);
  const [format, setFormat] = useState('all');
  const [hasMore, setHasMore] = useState(false);

  const load = async (before?: string) => {
    const result = await adminExports.list({
      format: format === 'all' ? undefined : (format as any),
      limit: 20,
      before,
    });
    setExports(prev => (before ? [...prev, ...result] : result));
    setHasMore(result.length === 20);
  };

  useEffect(() => { load(); }, [format]);

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Theo dõi Export</h1>
          <p className={shared.pageSubtitle}>Danh sách các lần export model trên toàn hệ thống (chỉ xem).</p>
        </div>
      </div>

      <div className={shared.toolbar}>
        <Select value={format} onValueChange={setFormat} options={FORMAT_OPTIONS} ariaLabel="Lọc định dạng" />
      </div>

      <div className={`${shared.tableWrap} glass-panel`}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>Project</th>
              <th>User</th>
              <th>Định dạng</th>
              <th>File Path</th>
              <th>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {exports.map(exp => (
              <tr key={exp.id}>
                <td>{exp.project_name}</td>
                <td className={shared.mutedCell}>{exp.user_email}</td>
                <td style={{ textTransform: 'uppercase' }}>{exp.format}</td>
                <td className={shared.mutedCell} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{exp.file_path}</td>
                <td className={shared.mutedCell}>{formatDateTime(exp.created_at)}</td>
              </tr>
            ))}
            {exports.length === 0 && (
              <tr><td colSpan={5}><div className={shared.emptyState}>Không có export nào phù hợp.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className={shared.loadMoreRow}>
          <button className={shared.textBtn} onClick={() => load(exports[exports.length - 1]?.created_at)}>Tải thêm</button>
        </div>
      )}
    </div>
  );
};
