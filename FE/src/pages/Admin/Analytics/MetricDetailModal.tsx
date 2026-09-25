import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { AdminAnalytics as Analytics } from '../../../types/admin';
import styles from './MetricDetailModal.module.css';

export type MetricKey =
  | 'mrr'
  | 'revenue'
  | 'gross_margin'
  | 'paying_customers'
  | 'churn'
  | 'retention'
  | 'repeat'
  | 'free_to_paid'
  | 'outstanding'
  | 'failed_payments'
  | 'discounts'
  | 'credit_revenue'
  | 'vat'
  | 'api_cost'
  | 'monthly_series'
  | 'revenue_by_plan'
  | 'payment_methods'
  | 'mrr_movement'
  | 'top_customers';

interface MetricDetailModalProps {
  metricKey: MetricKey;
  data: Analytics | null;
  days: number;
  onClose: () => void;
}

interface MetricConfig {
  title: string;
  category: string;
  code: string;
  currentValue: string;
  formula: string;
  variables: { symbol: string; desc: string }[];
  rules: { text: string; code?: string }[];
  dataSources: string[];
  breakdown: { label: string; value: string; note?: string; highlight?: boolean }[];
  businessMeaning: string;
}

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatVndSigned = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('vi-VN')} VNĐ`;
const formatPercent = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

function getMetricConfig(key: MetricKey, data: Analytics | null, days: number): MetricConfig {
  switch (key) {
    case 'mrr':
      return {
        title: 'MRR — Doanh Thu Định Kỳ Hàng Tháng',
        category: 'Doanh thu định kỳ',
        code: 'SRS §5.4 / BR-104',
        currentValue: formatVnd(data?.mrr_vnd ?? 0),
        formula: 'MRR = ∑ (Gói tháng) + ∑ (Gói năm ÷ 12)',
        variables: [
          { symbol: 'Gói tháng', desc: 'Số tiền thực trả của khách hàng trên gói chu kỳ tháng (monthly).' },
          { symbol: 'Gói năm ÷ 12', desc: 'Số tiền thực trả của gói năm quy chuẩn đều về giá trị 1 tháng.' },
        ],
        rules: [
          { text: 'Chỉ tính các thuê bao đang ở trạng thái ACTIVE hoặc GRACE (trong 3 ngày ân hạn).', code: 'BR-23' },
          { text: 'Loại trừ gói Free và gói tặng COMP (không phát sinh tiền thực tế).', code: 'BR-83' },
          { text: 'Loại trừ gói nạp Credit quét 3D vì Credit là mua dùng một lần, không định kỳ.', code: 'BR-94' },
          { text: 'Loại bỏ hoàn toàn các tài khoản nội bộ công ty khỏi số liệu.', code: 'BR-83' },
        ],
        dataSources: ['subscriptions', 'invoices', 'users'],
        breakdown: [
          { label: 'MRR hiện tại', value: formatVnd(data?.mrr_vnd ?? 0), note: 'Chuẩn hóa theo tháng', highlight: true },
          { label: 'ARR (Quy đổi năm = MRR × 12)', value: formatVnd(data?.arr_vnd ?? 0), note: 'Ước tính doanh thu 12 tháng' },
          { label: 'ARPU (Doanh thu bình quân / khách)', value: formatVnd(data?.arpu_vnd ?? 0), note: 'MRR ÷ Khách trả tiền' },
          { label: 'Tổng khách trả phí cấu thành MRR', value: `${(data?.paying_customers ?? 0).toLocaleString('vi-VN')} khách`, note: 'Thuê bao active/grace' },
        ],
        businessMeaning: 'MRR là thước đo chuẩn mực quan trọng nhất của mô hình SaaS (Phần mềm dịch vụ), phản ánh dòng tiền định kỳ có thể dự đoán được của KusShoes mà không phụ thuộc vào các giao dịch mua lẻ đột biến.',
      };

    case 'revenue': {
      const prevRev = data?.revenue_vnd?.previous ?? 0;
      const curRev = data?.revenue_vnd?.current ?? 0;
      const change = prevRev === 0 ? null : ((curRev - prevRev) / Math.abs(prevRev)) * 100;
      return {
        title: `Doanh Thu Ghi Nhận Thực Tế (${days} Ngày)`,
        category: 'Dòng tiền & Kế toán',
        code: 'SRS §5.4 / BR-106',
        currentValue: formatVnd(curRev),
        formula: 'Doanh thu ghi nhận = ∑ (Hóa đơn PAID trong kỳ) - ∑ (Hoàn tiền trong kỳ)',
        variables: [
          { symbol: 'Hóa đơn PAID', desc: 'Tất cả các giao dịch thanh toán thành công (gói cước + mua Credit).' },
          { symbol: 'Hoàn tiền', desc: 'Số tiền hoàn lại cho khách hàng theo ngày hoàn tiền thực tế phát sinh.' },
        ],
        rules: [
          { text: `Tính tất cả các khoản thanh toán trong khoảng thời gian ${days} ngày chọn.`, code: 'Period' },
          { text: 'Bao gồm cả doanh thu gói thuê bao lẫn gói mua thêm lượt quét Credit 3D.', code: 'Cashflow' },
          { text: 'Nếu hóa đơn bị hoàn tiền một phần hoặc toàn bộ, chỉ ghi nhận phần thực thu.', code: 'BR-97' },
          { text: 'Loại trừ các hóa đơn thử nghiệm từ tài khoản nội bộ (is_internal = true).', code: 'BR-83' },
        ],
        dataSources: ['invoices (status = paid)', 'refunds (created_at in period)', 'users'],
        breakdown: [
          { label: `Doanh thu kỳ này (${days} ngày)`, value: formatVnd(curRev), highlight: true },
          { label: `Doanh thu kỳ trước (${days} ngày trước)`, value: formatVnd(prevRev) },
          { label: 'Biến động tăng/giảm', value: change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`, note: 'So với kỳ trước' },
          { label: 'Tổng tiền đã hoàn trả trong kỳ', value: formatVnd(data?.refunds_vnd?.current ?? 0), note: 'Khấu trừ trực tiếp' },
          { label: 'Tỷ lệ hoàn tiền (Refund Rate)', value: formatPercent(data?.refund_rate ?? null), note: 'Hoàn tiền ÷ Doanh thu gốc' },
        ],
        businessMeaning: 'Doanh thu ghi nhận thể hiện dòng tiền thực tế chảy vào tài khoản KusShoes trong kỳ, phục vụ báo cáo tài chính, quyết toán thuế và đối soát ngân hàng.',
      };
    }

    case 'gross_margin': {
      const curRev = data?.revenue_vnd?.current ?? 0;
      const apiCost = data?.api_cost_vnd ?? 0;
      const margin = data?.gross_margin_vnd ?? 0;
      const marginRate = curRev > 0 ? (margin / curRev) * 100 : 0;
      return {
        title: 'Biên Lợi Nhuận Gộp (Gross Margin)',
        category: 'Hiệu quả tài chính',
        code: 'SRS §5.4 / SF-14 / BR-108',
        currentValue: formatVnd(margin),
        formula: 'Biên LN gộp = Doanh thu ghi nhận trong kỳ - Chi phí API 3D/AI',
        variables: [
          { symbol: 'Doanh thu ghi nhận', desc: 'Dòng tiền thực thu ròng sau khi trừ hoàn tiền trong kỳ.' },
          { symbol: 'Chi phí API 3D/AI', desc: 'Tổng chi phí điện toán GPU dựng mô hình 3D, Bake Texture và AI mesh.' },
        ],
        rules: [
          { text: 'Chi phí API tính theo số lượt gọi API thực tế ghi nhận trong log hệ thống SF-14.', code: 'SF-14' },
          { text: 'Đơn giá API đối chiếu theo thỏa thuận dịch vụ hạ tầng điện toán đám mây.', code: 'BR-108' },
        ],
        dataSources: ['invoices', 'refunds', 'api_cost_service / api_usage_logs'],
        breakdown: [
          { label: 'Lợi nhuận gộp còn lại', value: formatVnd(margin), highlight: true },
          { label: 'Doanh thu thực thu trong kỳ', value: formatVnd(curRev) },
          { label: 'Chi phí điện toán API 3D/AI', value: formatVnd(apiCost), note: 'Chi phí biến đổi trực tiếp' },
          { label: 'Tỷ suất lợi nhuận gộp (Gross Margin %)', value: `${marginRate.toFixed(1)}%`, note: 'Lợi nhuận gộp ÷ Doanh thu' },
        ],
        businessMeaning: 'Chỉ số đánh giá tính bền vững về mặt kinh tế đơn vị (Unit Economics): mỗi đồng doanh thu thu về từ người dùng có đủ bù đắp chi phí máy chủ GPU render 3D hay không.',
      };
    }

    case 'paying_customers':
      return {
        title: 'Khách Hàng Trả Tiền (Paying Customers)',
        category: 'Sức khỏe khách hàng',
        code: 'SRS §5.4 / BR-103',
        currentValue: `${(data?.paying_customers ?? 0).toLocaleString('vi-VN')} người dùng`,
        formula: 'Paying Customers = COUNT(DISTINCT user_id có gói cước ACTIVE hoặc GRACE)',
        variables: [
          { symbol: 'DISTINCT user_id', desc: 'Đếm người dùng duy nhất, dù người dùng có mua nhiều lần cũng chỉ tính 1 khách hàng.' },
        ],
        rules: [
          { text: 'Chỉ tính các gói cước trả phí đang có hiệu lực (status = active hoặc grace).', code: 'BR-103' },
          { text: 'Không tính tài khoản dùng gói dùng thử / miễn phí (Free) và gói COMP.', code: 'BR-83' },
          { text: 'Khách hàng mới (New Paying): Có giao dịch trả phí định kỳ đầu tiên rơi vào khoảng ngày đã chọn.', code: 'Cohorts' },
        ],
        dataSources: ['subscriptions', 'invoices', 'users'],
        breakdown: [
          { label: 'Khách hàng trả tiền đang hoạt động', value: `${(data?.paying_customers ?? 0).toLocaleString('vi-VN')} khách`, highlight: true },
          { label: `Khách trả tiền mới trong kỳ (${days}N)`, value: `+${data?.new_paying_customers?.current ?? 0} khách`, note: 'Giao dịch trả phí đầu tiên' },
          { label: 'Khách mới kỳ trước', value: `${data?.new_paying_customers?.previous ?? 0} khách` },
          { label: 'Tỷ lệ chuyển đổi Free → Paid', value: formatPercent(data?.free_to_paid?.rate ?? null), note: 'Từ người dùng xác thực' },
        ],
        businessMeaning: 'Quy mô tập khách hàng trả tiền thực tế, loại bỏ hoàn toàn người dùng đăng ký ảo, giúp định giá giá trị doanh nghiệp và theo dõi sức tăng trưởng của tệp khách hàng trung thành.',
      };

    case 'churn':
      return {
        title: 'Tỷ Lệ Churn (Tỷ Lệ Rời Bỏ Kỳ)',
        category: 'Sức khỏe tăng trưởng',
        code: 'SRS §5.4 / Churn Logic',
        currentValue: formatPercent(data?.churn?.rate ?? null),
        formula: 'Tỷ lệ Churn = (Số khách đến hạn nhưng không gia hạn ÷ Tổng khách đến hạn gia hạn) × 100%',
        variables: [
          { symbol: 'Khách đến hạn (Due)', desc: 'Các thuê bao có ngày kết thúc chu kỳ (cycle_end) rơi vào khoảng thời gian lọc.' },
          { symbol: 'Không gia hạn (Churned)', desc: 'Thuê bao đã quá thời gian ân hạn 3 ngày (Grace Period) mà không tiếp tục trả phí.' },
        ],
        rules: [
          { text: 'Khách hàng nâng cấp gói (Upgrade) trước khi hết hạn không tính là Churn.', code: 'BR-23' },
          { text: 'Hệ thống cho phép 3 ngày ân hạn (GRACE_DAYS = 3) trước khi chính thức đánh dấu Churn.', code: 'GRACE' },
          { text: 'Không tính các tài khoản dùng gói Credit vì Credit không có chu kỳ hết hạn cố định.', code: 'BR-94' },
        ],
        dataSources: ['invoices (billing_cycle, paid_at)', 'subscriptions'],
        breakdown: [
          { label: 'Tỷ lệ Churn kỳ này', value: formatPercent(data?.churn?.rate ?? null), highlight: true },
          { label: 'Số khách đến hạn không gia hạn', value: `${data?.churn?.churned ?? 0} khách`, note: 'Mất thuê bao' },
          { label: 'Tổng số khách đến hạn gia hạn', value: `${data?.churn?.due ?? 0} khách`, note: 'Tập khảo sát' },
          { label: 'Tỷ lệ duy trì (Retention Rate)', value: formatPercent(data?.churn?.rate !== null && data?.churn?.rate !== undefined ? 1 - data.churn.rate : null), note: '100% - Churn Rate' },
        ],
        businessMeaning: 'Chỉ số báo động về độ hài lòng của khách hàng. Tỷ lệ Churn thấp chứng minh sản phẩm 3D Sneaker Lab đáp ứng tốt nhu cầu thực tế của các shop và designer.',
      };

    case 'retention':
      return {
        title: 'NRR / GRR — Duy Trì Doanh Thu Khách Hàng',
        category: 'Sức khỏe tăng trưởng',
        code: 'SRS §5.4 / NRR & GRR',
        currentValue: `${formatPercent(data?.retention?.nrr ?? null)} / ${formatPercent(data?.retention?.grr ?? null)}`,
        formula: 'NRR = (Doanh thu tháng này của Cohort tháng trước ÷ Doanh thu tháng trước của chính Cohort đó) × 100%',
        variables: [
          { symbol: 'NRR (Net Revenue Retention)', desc: 'Tỷ lệ duy trì doanh thu thuần, đã bao gồm cả doanh thu nâng cấp gói (Expansion).' },
          { symbol: 'GRR (Gross Revenue Retention)', desc: 'Tỷ lệ duy trì gộp, không tính phần nâng cấp gói, tối đa là 100%.' },
        ],
        rules: [
          { text: 'Khảo sát dòng tiền của cùng 1 nhóm khách hàng qua 2 tháng liên tiếp liền kề.', code: 'Cohort' },
          { text: 'NRR > 100%: Doanh thu từ khách hàng cũ tăng thêm bù đắp hoàn toàn cho số khách hủy gói.', code: 'Benchmark' },
        ],
        dataSources: ['invoices (nhóm theo tháng thanh toán và user_id)'],
        breakdown: [
          { label: 'Tháng khảo sát', value: data?.retention?.month ?? '—' },
          { label: 'NRR (Net Revenue Retention)', value: formatPercent(data?.retention?.nrr ?? null), note: 'Gồm cả Expansion', highlight: true },
          { label: 'GRR (Gross Revenue Retention)', value: formatPercent(data?.retention?.grr ?? null), note: 'Tối đa 100%' },
        ],
        businessMeaning: 'NRR là thước đo vàng cho các công ty phần mềm. Nếu NRR trên 100%, doanh nghiệp có thể tự tăng trưởng doanh thu từ chính khách hàng hiện hữu mà chưa cần tìm thêm khách mới.',
      };

    case 'repeat':
      return {
        title: 'Khách Quay Lại (Repeat Purchase Rate)',
        category: 'Sức khỏe tăng trưởng',
        code: 'SRS §5.4 / BR-105',
        currentValue: formatPercent(data?.repeat?.rate ?? null),
        formula: 'Tỷ lệ quay lại = (Số khách có ≥ 2 hóa đơn gói ÷ Khách trả tiền đã tới kỳ gia hạn lần 2) × 100%',
        variables: [
          { symbol: 'Khách mua ≥ 2 lần', desc: 'Người dùng đã thực hiện thành công ít nhất 2 lần thanh toán gói cước.' },
          { symbol: 'Khách đủ điều kiện', desc: 'Người dùng đã đồng hành đủ lâu để chu kỳ gói thứ nhất kết thúc và bước sang kỳ thứ hai.' },
        ],
        rules: [
          { text: 'Loại trừ nhóm khách hàng mới đăng ký gần đây chưa đến hạn gia hạn lần 2.', code: 'BR-105' },
          { text: 'Đảm bảo tỷ lệ phản ánh đúng lòng trung thành thay vì bị pha loãng bởi khách mới.', code: 'Cohort' },
        ],
        dataSources: ['invoices (đếm số hóa đơn per user_id)'],
        breakdown: [
          { label: 'Tỷ lệ khách mua lại (Repeat Rate)', value: formatPercent(data?.repeat?.rate ?? null), highlight: true },
          { label: 'Khách đã mua từ 2 lần trở lên', value: `${data?.repeat?.repeat_customers ?? 0} khách` },
          { label: 'Tổng khách đã tới mốc kỳ 2', value: `${data?.repeat?.paying_customers ?? 0} khách`, note: 'Đủ điều kiện xét' },
          { label: 'Khách mới chưa đến kỳ gia hạn', value: `${data?.repeat?.not_yet_due ?? 0} khách`, note: 'Tạm chưa xét' },
        ],
        businessMeaning: 'Đo lường mức độ tin dùng của các xưởng giày và designer sneaker đối với các tính năng chuyên sâu của KusShoes sau khi dùng thử xong kỳ đầu tiên.',
      };

    case 'free_to_paid':
      return {
        title: 'Tỷ Lệ Chuyển Đổi Free → Trả Phí',
        category: 'Sức khỏe tăng trưởng',
        code: 'SRS §5.4 / Conversion Funnel',
        currentValue: formatPercent(data?.free_to_paid?.rate ?? null),
        formula: 'Tỷ lệ chuyển đổi = (Số user đã xác thực từng thanh toán ÷ Tổng số user đã xác thực email) × 100%',
        variables: [
          { symbol: 'Tử số', desc: 'Số người dùng duy nhất đã xác thực email và có ít nhất 1 hóa đơn thanh toán thành công.' },
          { symbol: 'Mẫu số', desc: 'Tổng số người dùng có vai trò "user", đã bấm xác nhận email và không phải tài khoản nội bộ.' },
        ],
        rules: [
          { text: 'Chỉ tính người dùng đã kích hoạt email thật (is_verified = true).', code: 'Anti-Spam' },
          { text: 'Loại trừ tài khoản nhân sự nội bộ và admin.', code: 'BR-83' },
        ],
        dataSources: ['users (is_verified = true, role = user)', 'invoices (status = paid)'],
        breakdown: [
          { label: 'Tỷ lệ chuyển đổi Free → Paid', value: formatPercent(data?.free_to_paid?.rate ?? null), highlight: true },
          { label: 'Người dùng đã từng trả phí', value: `${data?.free_to_paid?.numerator ?? 0} người dùng`, note: 'Đã chi trả tiền' },
          { label: 'Tổng người dùng đã xác thực email', value: `${data?.free_to_paid?.denominator ?? 0} người dùng`, note: 'Tập người dùng thực tế' },
        ],
        businessMeaning: 'Đo lường hiệu quả phễu marketing và khả năng thuyết phục người dùng trải nghiệm miễn phí chuyển sang trả tiền để sử dụng tính năng cao cấp.',
      };

    case 'outstanding':
      return {
        title: 'Công Nợ Chờ Thu (Accounts Receivable — AR)',
        category: 'Dòng tiền & Công nợ',
        code: 'SRS §5.4 / AR Snapshot',
        currentValue: formatVnd(data?.outstanding?.amount_vnd ?? 0),
        formula: 'Công nợ AR = ∑ (Giá trị hóa đơn trạng thái pending hoặc awaiting_approval)',
        variables: [
          { symbol: 'Pending', desc: 'Hóa đơn vừa tạo, đang chờ khách hàng quét mã VietQR / PayOS thanh toán.' },
          { symbol: 'Awaiting Approval', desc: 'Hóa đơn chuyển khoản thủ công hoặc yêu cầu duyệt từ kế toán.' },
        ],
        rules: [
          { text: 'Đây là dữ liệu tức thời (Snapshot) tại thời điểm hiện tại của hệ thống.', code: 'Realtime' },
          { text: 'Chỉ tính các hóa đơn có giá trị lớn hơn 0 VNĐ và của khách hàng thực.', code: 'BR-83' },
        ],
        dataSources: ['invoices (status IN pending, awaiting_approval)'],
        breakdown: [
          { label: 'Tổng tiền công nợ đang chờ thu', value: formatVnd(data?.outstanding?.amount_vnd ?? 0), highlight: true },
          { label: 'Số lượng hóa đơn đang chờ xử lý', value: `${data?.outstanding?.count ?? 0} hóa đơn`, note: 'Đang mở' },
        ],
        businessMeaning: 'Giúp bộ phận kế toán và kinh doanh theo dõi các đơn hàng đang dở dang để kịp thời gửi email nhắc nhở thanh toán hoặc đối soát chuyển khoản ngân hàng.',
      };

    case 'failed_payments':
      return {
        title: 'Thanh Toán Lỗi (Failed Payments 30 Ngày)',
        category: 'Dòng tiền & Rủi ro',
        code: 'SRS §5.4 / Payment Monitoring',
        currentValue: `${data?.failed_payments?.count_30d ?? 0} giao dịch`,
        formula: 'Failed Payments = COUNT & SUM (Hóa đơn trạng thái "failed" trong 30 ngày gần nhất)',
        variables: [
          { symbol: 'Hóa đơn failed', desc: 'Giao dịch thanh toán bị cổng thanh toán từ chối, hết hạn phiên hoặc lỗi số dư.' },
        ],
        rules: [
          { text: 'Khung thời gian cố định: 30 ngày gần nhất tính từ thời điểm hiện tại.', code: 'Rolling 30D' },
          { text: 'Loại trừ các thử nghiệm lỗi của tài khoản nội bộ công ty.', code: 'BR-83' },
        ],
        dataSources: ['invoices (status = failed, created_at >= NOW - 30 days)'],
        breakdown: [
          { label: 'Số lượng giao dịch lỗi 30 ngày', value: `${data?.failed_payments?.count_30d ?? 0} giao dịch`, highlight: true },
          { label: 'Tổng giá trị giao dịch bị thất thoát', value: formatVnd(data?.failed_payments?.amount_30d_vnd ?? 0), note: 'Doanh thu tiềm năng' },
        ],
        businessMeaning: 'Cảnh báo sớm sự cố kết nối với cổng thanh toán PayOS / MoMo hoặc thẻ tín dụng bị từ chối, tránh thất thoát doanh số.',
      };

    case 'discounts':
      return {
        title: 'Chiết Khấu Đã Áp Dụng (Discounts & Vouchers)',
        category: 'Dòng tiền & Khuyến mãi',
        code: 'SRS §5.4 / Promotion',
        currentValue: formatVnd(data?.discounts_vnd ?? 0),
        formula: 'Tổng chiết khấu = ∑ (discount_vnd trên các hóa đơn đã thanh toán trong kỳ)',
        variables: [
          { symbol: 'discount_vnd', desc: 'Số tiền giảm trực tiếp trên hóa đơn từ voucher khuyến mãi hoặc chiết khấu gói năm.' },
        ],
        rules: [
          { text: 'Chỉ cộng dồn chiết khấu của những hóa đơn khách hàng đã thanh toán thành công.', code: 'Realized' },
          { text: 'Khoảng thời gian áp dụng theo bộ lọc ngày được chọn.', code: 'Period' },
        ],
        dataSources: ['invoices (discount_vnd > 0, status = paid)'],
        breakdown: [
          { label: 'Tổng giá trị chiết khấu trong kỳ', value: formatVnd(data?.discounts_vnd ?? 0), highlight: true },
          { label: 'Phạm vi khảo sát', value: `${days} ngày gần nhất` },
        ],
        businessMeaning: 'Đo lường chi phí ngân sách khuyến mãi đã giải ngân, giúp đánh giá hiệu quả của các chiến dịch coupon marketing so với doanh thu mang lại.',
      };

    case 'credit_revenue':
      return {
        title: 'Doanh Thu Credit Quét 3D (Scan Credits)',
        category: 'Dòng tiền & Kế toán',
        code: 'SRS §5.4 / BR-94',
        currentValue: formatVnd(data?.credit_revenue_vnd ?? 0),
        formula: 'Doanh thu Credit = ∑ (Hóa đơn mua gói Credit đã thanh toán thành công trong kỳ)',
        variables: [
          { symbol: 'Gói Credit', desc: 'Số tiền người dùng nạp thêm để quét và chuyển đổi ảnh chụp giày thành mô hình 3D.' },
        ],
        rules: [
          { text: 'QUY CHUẨN BR-94: Doanh thu Credit được tính vào dòng tiền nhưng KHÔNG được tính vào MRR.', code: 'BR-94' },
          { text: 'Lý do: Credit là giao dịch trả trước sử dụng theo lượt (one-off), không phải thuê bao chu kỳ tự động.', code: 'Accounting' },
        ],
        dataSources: ['invoices (plan_tier = credit, status = paid)'],
        breakdown: [
          { label: 'Doanh thu Credit trong kỳ', value: formatVnd(data?.credit_revenue_vnd ?? 0), highlight: true },
          { label: 'Quy chuẩn kế toán áp dụng', value: 'BR-94 (Không đưa vào MRR)' },
        ],
        businessMeaning: 'Mảng doanh thu bổ trợ dựa trên mức độ sử dụng tính năng quét 3D thực tế của người dùng, phản ánh nhu cầu số hóa sản phẩm giày ngoài gói thuê bao cơ bản.',
      };

    case 'vat':
      return {
        title: 'Thuế VAT Ước Tính (Estimated VAT Collected)',
        category: 'Thuế & Pháp lý',
        code: 'SRS §5.4 / Tax Engine',
        currentValue: formatVnd(data?.vat_collected_vnd ?? 0),
        formula: 'Thuế VAT = Doanh thu ghi nhận ròng × Thuế suất VAT (8% hoặc 10%)',
        variables: [
          { symbol: 'Doanh thu ròng', desc: 'Doanh thu tính thuế sau khi trừ các khoản giảm giá và hoàn tiền hợp lệ.' },
          { symbol: 'Thuế suất', desc: 'Tỷ lệ thuế suất giá trị gia tăng được cấu hình trong tax_service theo ngành phần mềm/dịch vụ số.' },
        ],
        rules: [
          { text: 'Tính toán theo thuật toán của tax_service tuân thủ luật thuế điện tử Việt Nam.', code: 'Tax Service' },
          { text: 'Số liệu mang tính ước tính đối soát kế toán trước khi xuất hóa đơn điện tử.', code: 'Estimate' },
        ],
        dataSources: ['invoices', 'tax_service'],
        breakdown: [
          { label: 'Thuế VAT ước tính kỳ này', value: formatVnd(data?.vat_collected_vnd ?? 0), highlight: true },
          { label: 'Cơ sở tính thuế', value: 'Doanh thu thực thu trong kỳ' },
        ],
        businessMeaning: 'Giúp ban giám đốc chuẩn bị nguồn tiền dự trữ để nộp nghĩa vụ thuế VAT định kỳ cho cơ quan thuế nhà nước.',
      };

    case 'api_cost':
      return {
        title: 'Chi Phí Điện Toán API 3D/AI (Compute Costs)',
        category: 'Chi phí hạ tầng',
        code: 'SRS §5.4 / SF-14 / BR-108',
        currentValue: formatVnd(data?.api_cost_vnd ?? 0),
        formula: 'Chi phí API = ∑ (Số lượt tác vụ 3D/AI × Đơn giá điện toán tài nguyên GPU)',
        variables: [
          { symbol: 'Tác vụ 3D/AI', desc: 'Các lệnh AI photogrammetry, tạo lưới mesh 3D, Bake Texture PBR và khử nhiễu.' },
          { symbol: 'Đơn giá điện toán', desc: 'Chi phí quy đổi theo thời gian tính toán của server GPU (SF-14).' },
        ],
        rules: [
          { text: 'Ghi nhận chi phí cho mọi cuộc gọi API hợp lệ được hệ thống xử lý.', code: 'SF-14' },
          { text: 'Được khấu trừ trực tiếp khi tính Biên lợi nhuận gộp của KusShoes.', code: 'BR-108' },
        ],
        dataSources: ['api_cost_service', 'bake_jobs', 'api_usage_logs'],
        breakdown: [
          { label: 'Tổng chi phí API phát sinh trong kỳ', value: formatVnd(data?.api_cost_vnd ?? 0), highlight: true },
          { label: 'Khoảng thời gian khảo sát', value: `${days} ngày áp dụng` },
          { label: 'Ảnh hưởng tài chính', value: 'Trừ trực tiếp vào Lợi nhuận gộp' },
        ],
        businessMeaning: 'Kiểm soát chi phí hạ tầng máy chủ AI, đảm bảo các tính năng số hóa 3D không tiêu tốn vượt quá mức phí thuê bao thu về.',
      };

    case 'monthly_series': {
      const series = data?.revenue_series ?? [];
      const total = series.reduce((acc, p) => acc + p.revenue_vnd, 0);
      return {
        title: 'Chuỗi Doanh Thu Theo Chu Kỳ Tháng',
        category: 'Xu hướng dòng tiền',
        code: 'SRS §5.4 / Monthly Trend',
        currentValue: formatVnd(total),
        formula: 'Doanh thu tháng M = ∑ (Hóa đơn PAID trong tháng M) - ∑ (Hoàn tiền trong tháng M)',
        variables: [
          { symbol: 'Tháng M', desc: 'Thời gian theo tháng dương lịch tính theo múi giờ Việt Nam GMT+7.' },
        ],
        rules: [
          { text: 'Nhóm doanh thu thực thu theo tháng dương lịch.', code: 'GMT+7' },
          { text: 'Bao gồm cả doanh thu gói thuê bao và gói Credit mua lẻ.', code: 'Consolidated' },
        ],
        dataSources: ['invoices (nhóm theo tháng paid_at)'],
        breakdown: [
          { label: 'Tổng doanh thu toàn bộ chuỗi hiển thị', value: formatVnd(total), highlight: true },
          ...series.map((s) => ({
            label: `Tháng ${s.month}`,
            value: formatVnd(s.revenue_vnd),
            note: 'Dòng tiền ròng',
          })),
        ],
        businessMeaning: 'Biểu đồ trực quan giúp nhận diện xu hướng tăng trưởng doanh số, mùa cao điểm thiết kế giày (như dịp Tết, hè) và xu hướng dài hạn.',
      };
    }

    case 'revenue_by_plan':
      return {
        title: 'Cơ Cấu Doanh Thu Theo Gói Cước',
        category: 'Phân tích sản phẩm',
        code: 'SRS §5.4 / Plan Share',
        currentValue: `${data?.revenue_by_plan?.length ?? 0} gói phát sinh`,
        formula: 'Tỷ trọng gói = (Doanh thu của gói cước ÷ Tổng doanh thu các gói) × 100%',
        variables: [
          { symbol: 'Doanh thu gói', desc: 'Tổng tiền thu về từ người dùng mua gói cước đó trong kỳ.' },
        ],
        rules: [
          { text: 'Tính tất cả các gói cước đang phân phối (Starter, Pro, Enterprise, Credit...).', code: 'All Plans' },
          { text: 'Tỷ trọng % được làm tròn đến 1 chữ số thập phân.', code: 'Rounding' },
        ],
        dataSources: ['invoices (group by plan_tier)'],
        breakdown: (data?.revenue_by_plan ?? []).map((p) => ({
          label: `Gói ${p.plan_tier.toUpperCase()}`,
          value: formatVnd(p.revenue_vnd),
          note: `Chiếm ${formatPercent(p.share)} tổng doanh số`,
          highlight: p.share > 0.3,
        })),
        businessMeaning: 'Biết được gói cước nào là "ngựa chiến" đem lại nhiều tiền nhất cho KusShoes để tập trung tối ưu tính năng và chính sách giá.',
      };

    case 'payment_methods':
      return {
        title: 'Doanh Thu Theo Phương Thức Thanh Toán',
        category: 'Cổng thanh toán',
        code: 'SRS §5.4 / Payment Channel',
        currentValue: `${data?.payment_methods?.length ?? 0} cổng ghi nhận`,
        formula: 'Tỷ trọng kênh = (Doanh thu qua cổng thanh toán ÷ Tổng doanh thu) × 100%',
        variables: [
          { symbol: 'PayOS', desc: 'Thanh toán quét mã QR VietQR tự động qua ngân hàng và thẻ nội địa NAPAS.' },
          { symbol: 'MoMo', desc: 'Thanh toán trực tiếp qua ví điện tử MoMo.' },
          { symbol: 'Manual', desc: 'Chuyển khoản thủ công có nhân sự duyệt ủy nhiệm chi.' },
        ],
        rules: [
          { text: 'Chỉ cộng tiền khi giao dịch qua cổng được xác nhận thành công (PAID).', code: 'Gateway Webhook' },
        ],
        dataSources: ['invoices (group by payment_method)'],
        breakdown: (data?.payment_methods ?? []).map((m) => ({
          label: m.payment_method === 'payos' ? 'PayOS (VietQR / Thẻ)' : m.payment_method === 'momo' ? 'Ví MoMo' : 'Chuyển khoản thủ công',
          value: formatVnd(m.revenue_vnd),
          note: `Chiếm ${formatPercent(m.share)} tổng giao dịch`,
        })),
        businessMeaning: 'Đánh giá thói quen thanh toán của khách hàng, đảm bảo các cổng thanh toán có mức phí trung gian hợp lý và hoạt động ổn định.',
      };

    case 'mrr_movement': {
      const mov = data?.mrr_movement;
      return {
        title: `Biến Động MRR — Thác Dòng Tiền (${mov?.month ?? 'Tháng này'})`,
        category: 'Doanh thu định kỳ',
        code: 'SRS §5.4 / Waterfall',
        currentValue: formatVndSigned(mov?.net_new ?? 0),
        formula: 'Net New MRR = (Mới + Nâng cấp + Kích hoạt lại) - (Hạ cấp + Hủy gói)',
        variables: [
          { symbol: 'Khách hàng mới (New)', desc: 'MRR từ khách hàng lần đầu mua gói trả phí trong tháng.' },
          { symbol: 'Nâng cấp (Expansion)', desc: 'MRR tăng thêm khi khách hàng cũ đổi từ gói thấp lên gói cao hơn.' },
          { symbol: 'Kích hoạt lại (Reactivated)', desc: 'MRR từ khách hàng từng hủy gói nay quay lại mua thuê bao.' },
          { symbol: 'Hạ cấp (Contraction)', desc: 'MRR bị giảm khi khách hàng hạ từ gói cao xuống gói thấp hơn.' },
          { symbol: 'Hủy gói (Churn)', desc: 'MRR mất đi hoàn toàn do khách hàng hủy hoặc không gia hạn tiếp.' },
        ],
        rules: [
          { text: 'Tính biến động MRR giữa tháng trước và tháng đang khảo sát.', code: 'Month-over-Month' },
          { text: 'Net New MRR dương (> 0) chứng tỏ doanh thu định kỳ của KusShoes đang tăng trưởng.', code: 'Health' },
        ],
        dataSources: ['invoices', 'subscriptions (so sánh lịch sử gói cước)'],
        breakdown: [
          { label: 'Net New MRR (Tăng trưởng ròng)', value: formatVndSigned(mov?.net_new ?? 0), highlight: true },
          { label: '+ Khách hàng mới (New)', value: formatVnd(mov?.new ?? 0), note: 'Dòng tiền vào' },
          { label: '+ Nâng cấp gói (Expansion)', value: formatVnd(mov?.expansion ?? 0), note: 'Dòng tiền vào' },
          { label: '+ Kích hoạt lại (Reactivated)', value: formatVnd(mov?.reactivation ?? 0), note: 'Dòng tiền vào' },
          { label: '- Hạ cấp gói (Contraction)', value: formatVnd(mov?.contraction ?? 0), note: 'Dòng tiền ra' },
          { label: '- Hủy gói hoàn toàn (Churn)', value: formatVnd(mov?.churn ?? 0), note: 'Dòng tiền ra' },
        ],
        businessMeaning: 'Mô hình Waterfall bóc tách chính xác vì sao MRR tăng hoặc giảm, giúp ban lãnh đạo biết rõ tăng trưởng đến từ khách mới hay do giữ chân và upsell khách cũ tốt.',
      };
    }

    case 'top_customers':
      return {
        title: 'Khách Hàng Doanh Thu Cao (Top VIP Customers)',
        category: 'Khách hàng',
        code: 'SRS §5.4 / VIP Tier',
        currentValue: `${data?.top_customers?.length ?? 0} khách hàng VIP`,
        formula: 'Chi tiêu ròng = ∑ (Hóa đơn PAID của khách) - ∑ (Hoàn tiền của khách)',
        variables: [
          { symbol: 'Chi tiêu ròng', desc: 'Tổng số tiền thực tế khách hàng đã thanh toán sau khi trừ các khoản hoàn trả.' },
        ],
        rules: [
          { text: 'Xếp hạng giảm dần theo số tiền thực chi trong khoảng ngày đã chọn.', code: 'Ranking' },
          { text: 'Chỉ xét các giao dịch hợp lệ của tài khoản người dùng thực.', code: 'BR-83' },
        ],
        dataSources: ['invoices (group by user_id)', 'users'],
        breakdown: (data?.top_customers ?? []).map((c, i) => ({
          label: `#${i + 1} ${c.email ?? c.user_id}`,
          value: formatVnd(c.net_paid_vnd),
          note: `${c.orders} đơn hàng hoàn tất`,
          highlight: i === 0,
        })),
        businessMeaning: 'Nhận diện tệp khách hàng VIP (các thương hiệu giày lớn, xưởng sản xuất) để có chính sách chăm sóc đặc biệt, hỗ trợ kỹ thuật ưu tiên và giữ chân khách hàng.',
      };

    default:
      return {
        title: 'Thông Tin Chỉ Số',
        category: 'Tổng quan',
        code: 'SRS §5.4',
        currentValue: '—',
        formula: 'Đang cập nhật công thức.',
        variables: [],
        rules: [],
        dataSources: [],
        breakdown: [],
        businessMeaning: '',
      };
  }
}

export const MetricDetailModal: React.FC<MetricDetailModalProps> = ({
  metricKey,
  data,
  days,
  onClose,
}) => {
  const config = getMetricConfig(metricKey, data, days);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            
            <div className={styles.titleArea}>
              <div className={styles.badgeRow}>
                <span className={styles.categoryBadge}>{config.category}</span>
                <span className={styles.codeBadge}>{config.code}</span>
              </div>
              <h3 className={styles.title}>{config.title}</h3>
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Giá trị hiện tại */}
          <div className={styles.valueBanner}>
            <span className={styles.valueBannerLabel}>Giá trị ghi nhận hiện thời</span>
            <span className={styles.valueBannerNumber}>{config.currentValue}</span>
          </div>

          {/* 1. Công thức tính toán */}
          <div className={styles.section}>
            <h4 className={styles.sectionHeading}>
              Công thức tính toán (Formula)
            </h4>
            <div className={styles.formulaBox}>{config.formula}</div>
            {config.variables.length > 0 && (
              <div className={styles.variableList}>
                {config.variables.map((v) => (
                  <div key={v.symbol} className={styles.variableItem}>
                    <span className={styles.variableSymbol}>{v.symbol}:</span>
                    <span className={styles.variableDesc}>{v.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Bóc tách số liệu thực tế hiện tại */}
          {config.breakdown.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionHeading}>
                Bóc tách cấu thành số liệu thực tế (Audit Breakdown)
              </h4>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Thành phần số liệu</th>
                      <th style={{ textAlign: 'right' }}>Giá trị thực tế</th>
                      <th>Ghi chú nghiệp vụ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.breakdown.map((row, idx) => (
                      <tr key={idx} className={row.highlight ? styles.tableRowHighlight : undefined}>
                        <td className={styles.cellLabel}>{row.label}</td>
                        <td className={styles.cellValue}>{row.value}</td>
                        <td className={styles.cellNote}>{row.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Nguồn dữ liệu & Điều kiện lọc */}
          <div className={styles.section}>
            <h4 className={styles.sectionHeading}>
              Nguồn dữ liệu &amp; Điều kiện kiểm toán (Audit Criteria)
            </h4>
            <div className={styles.ruleList}>
              {config.dataSources.length > 0 && (
                <div className={styles.ruleItem}>
                  <span>
                    Bảng cơ sở dữ liệu: {config.dataSources.map((ds) => (
                      <span key={ds} className={styles.ruleCode} style={{ marginRight: 4 }}>
                        {ds}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {config.rules.map((rule, idx) => (
                <div key={idx} className={styles.ruleItem}>
                  <span>
                    {rule.code && <span className={styles.ruleCode} style={{ marginRight: 6 }}>{rule.code}</span>}
                    {rule.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Ý nghĩa kinh doanh */}
          {config.businessMeaning && (
            <div className={styles.section}>
              <h4 className={styles.sectionHeading}>
                Ý nghĩa kinh doanh &amp; Ra quyết định
              </h4>
              <div className={styles.meaningBox}>
                {config.businessMeaning}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.doneBtn} onClick={onClose}>
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
