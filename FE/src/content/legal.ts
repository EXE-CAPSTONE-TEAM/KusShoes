/**
 * Terms of Service and Privacy Policy (vi + en). Accepting them is recorded in consent_records
 * with LEGAL_VERSION; bump it (and ask users again) whenever the substance changes.
 *
 * Every factual statement here mirrors the running system; update both together:
 * - retention: BE app/policy.py (30-day account / project restore), login history 90 days (BR-18),
 *   scan videos deleted from our storage once KIRI accepts them (ar-ai-exe kiri_pipeline.py);
 * - processors and regions: Neon (ap-southeast-1), GCP VM (asia-southeast1), Cloudflare R2,
 *   Vercel, KIRI Engine, Google Sign-In, Gmail SMTP, PayOS;
 * - billing: no stored cards, no auto-renewal (billing_service.py), scan credits valid 12 months.
 */

export const LEGAL_VERSION = '1.0';
export const LEGAL_EFFECTIVE_DATE = { vi: '29/09/2026', en: '29 September 2026' };
export const LEGAL_CONTACT_EMAIL = 'kusshoes@gmail.com';

export type LegalDocKey = 'privacy' | 'terms';
export type LegalLang = 'vi' | 'en';

/** English only when the UI language is English; Vietnamese (the prevailing version) otherwise. */
export function legalLang(language: string | undefined): LegalLang {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'vi';
}

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

const OPERATOR_VI =
  'KusShoes là dự án của nhóm sinh viên Trường Đại học FPT (FPT University) cơ sở TP. Hồ Chí Minh, chưa có pháp nhân. Địa chỉ liên hệ: Lô E2a-7, Đường D1, Khu Công nghệ cao, Phường Tăng Nhơn Phú, TP. Hồ Chí Minh. Email: kusshoes@gmail.com.';
const OPERATOR_EN =
  'KusShoes is a project of a student team at FPT University, Ho Chi Minh City campus, and is not a registered legal entity. Address: Lot E2a-7, D1 Street, Saigon Hi-Tech Park, Tang Nhon Phu Ward, Ho Chi Minh City, Vietnam. Email: kusshoes@gmail.com.';

export const LEGAL_DOCS: Record<LegalLang, Record<LegalDocKey, LegalDoc>> = {
  vi: {
    privacy: {
      title: 'Chính sách bảo mật',
      intro:
        'Chính sách này giải thích KusShoes thu thập dữ liệu gì khi bạn dùng trang web kusshoes.vercel.app, ứng dụng Android KusShoes (vn.kusshoes.mobile) và ứng dụng KusStudio Desktop (KusShoes Editor), dùng vào việc gì, chia sẻ với ai, lưu bao lâu và bạn có những quyền gì.',
      sections: [
        { id: 'operator', title: '1. Ai chịu trách nhiệm về dữ liệu của bạn', body: [OPERATOR_VI] },
        {
          id: 'collect',
          title: '2. Dữ liệu chúng tôi thu thập',
          body: [
            'Dữ liệu bạn cung cấp:',
            [
              'Tài khoản: email, mật khẩu (chỉ lưu dạng mã hoá một chiều bằng bcrypt, chúng tôi không đọc được), họ tên, tên người dùng.',
              'Hồ sơ (không bắt buộc): ảnh đại diện, số điện thoại, giới thiệu bản thân, thông tin studio, tên tài khoản mạng xã hội, ngôn ngữ và phong cách yêu thích.',
              'Bảo mật (nếu bạn bật): cài đặt xác thực hai bước, email khôi phục.',
              'Nội dung: video quét giày, mô hình 3D được dựng từ video, thiết kế (sticker, chữ, màu), ảnh đại diện dự án và các file bạn xuất ra.',
              'Phản hồi và báo cáo vi phạm bạn gửi cho chúng tôi.',
            ],
            'Dữ liệu tự động ghi nhận:',
            [
              'Lịch sử đăng nhập: thời điểm, địa chỉ IP, loại trình duyệt/thiết bị, đăng nhập thành công hay thất bại.',
              'Nếu đăng nhập bằng Google: mã định danh tài khoản Google, email và tên từ hồ sơ Google.',
              'Nguồn giới thiệu nếu có (tham số UTM, mã giới thiệu).',
              'Thông tin gói dịch vụ và hoá đơn: gói, số tiền, trạng thái thanh toán. Chúng tôi không nhận và không lưu số thẻ hay thông tin tài khoản ngân hàng của bạn.',
            ],
            'Ứng dụng Android chỉ xin quyền Camera (để quay video giày) và Internet. Video được quay không có âm thanh.',
          ],
        },
        {
          id: 'purpose',
          title: '3. Chúng tôi dùng dữ liệu để làm gì',
          body: [
            [
              'Tạo và quản lý tài khoản, đăng nhập, xác thực hai bước, khôi phục mật khẩu.',
              'Dựng mô hình 3D từ video quét, lưu và hiển thị dự án của bạn trên web, ứng dụng Android và KusStudio Desktop.',
              'Xử lý thanh toán, hoá đơn, nhắc gia hạn gói và hoàn tiền.',
              'Gửi email cần thiết cho tài khoản: mã xác thực, đặt lại mật khẩu, hoá đơn, nhắc gia hạn.',
              'Bảo vệ dịch vụ: phát hiện đăng nhập bất thường, chống lạm dụng, xử lý báo cáo vi phạm và khiếu nại bản quyền.',
            ],
            'Chúng tôi không dùng cookie quảng cáo hay công cụ theo dõi của bên thứ ba, không bán dữ liệu của bạn, và không gửi email quảng cáo. Nếu sau này muốn thêm công cụ phân tích hoặc email tiếp thị, chúng tôi sẽ cập nhật chính sách này và xin sự đồng ý của bạn trước.',
            'Chúng tôi không dùng video, mô hình hay thiết kế của bạn để quảng cáo hoặc để huấn luyện trí tuệ nhân tạo, trừ khi bạn đồng ý riêng cho từng trường hợp.',
          ],
        },
        {
          id: 'basis',
          title: '4. Cơ sở xử lý',
          body: [
            'Chúng tôi xử lý dữ liệu dựa trên sự đồng ý bạn đưa ra khi đăng ký (bạn tick ô xác nhận đủ 18 tuổi và đồng ý với Điều khoản dịch vụ và Chính sách này), và để thực hiện dịch vụ bạn đã yêu cầu. Bạn có thể rút lại sự đồng ý bất cứ lúc nào (mục 9); khi đó chúng tôi sẽ không thể tiếp tục cung cấp các phần dịch vụ cần đến dữ liệu tương ứng.',
          ],
        },
        {
          id: 'share',
          title: '5. Chúng tôi chia sẻ dữ liệu với ai',
          body: [
            'Chúng tôi dùng các nhà cung cấp dưới đây để vận hành dịch vụ. Họ chỉ nhận phần dữ liệu cần cho việc của họ:',
            [
              'KIRI Engine (KIRI Innovation): nhận video quét của bạn để dựng mô hình 3D. Video được xử lý trên máy chủ của KIRI ở ngoài Việt Nam theo chính sách của họ: https://www.kiriengine.app/privacy-policy. Ngay khi KIRI nhận video, chúng tôi xoá bản video trên kho lưu trữ của mình.',
              'Neon: cơ sở dữ liệu (máy chủ tại Singapore).',
              'Google Cloud Platform: máy chủ ứng dụng (tại Singapore).',
              'Cloudflare R2: lưu trữ file (video trước khi gửi KIRI, mô hình 3D, ảnh, file xuất).',
              'Vercel: lưu trữ và phục vụ trang web.',
              'Google: đăng nhập bằng Google (nếu bạn chọn).',
              'Gmail (Google): gửi email cho bạn.',
              'PayOS: xử lý thanh toán; thông tin thanh toán bạn nhập được xử lý trực tiếp bởi PayOS và ngân hàng.',
            ],
            'Chuyển dữ liệu ra nước ngoài: phần lớn các nhà cung cấp trên đặt máy chủ ngoài Việt Nam (Singapore và các quốc gia khác), vì vậy dữ liệu của bạn được chuyển và xử lý ở nước ngoài. Bằng việc đồng ý với Chính sách này, bạn đồng ý với việc chuyển dữ liệu đó để vận hành dịch vụ.',
            'Chúng tôi chỉ cung cấp dữ liệu cho cơ quan nhà nước khi có yêu cầu hợp pháp theo quy định của pháp luật Việt Nam.',
            'Khi bạn tự tạo link hoặc mã QR chia sẻ (Artisan), bất kỳ ai có link đều xem và tải được mô hình bạn chia sẻ cho tới khi bạn thu hồi link trong trang dự án.',
          ],
        },
        {
          id: 'retention',
          title: '6. Chúng tôi lưu dữ liệu bao lâu',
          body: [
            [
              'Dữ liệu tài khoản và dự án: trong suốt thời gian bạn dùng dịch vụ.',
              'Video quét: bị xoá khỏi kho lưu trữ của chúng tôi ngay khi KIRI Engine nhận để xử lý.',
              'Lịch sử đăng nhập (kèm IP): 90 ngày, sau đó tự xoá.',
              'Dự án bạn xoá: nằm trong Thùng rác 30 ngày để bạn khôi phục, sau đó bị xoá hẳn cùng file.',
              'Tài khoản bạn xoá: có thể khôi phục trong 30 ngày; sau đó toàn bộ dự án và file bị xoá, thông tin cá nhân trong tài khoản bị ẩn danh hoá.',
              'Hoá đơn: được giữ lại theo nghĩa vụ kế toán kể cả sau khi bạn xoá tài khoản.',
            ],
          ],
        },
        {
          id: 'security',
          title: '7. Bảo mật',
          body: [
            'Mọi kết nối tới dịch vụ đều qua HTTPS. Mật khẩu được lưu dạng mã hoá một chiều (bcrypt). File của bạn được lưu trên Cloudflare R2 với tên ngẫu nhiên, không đoán được. Bạn có thể bật xác thực hai bước. Không có hệ thống nào an toàn tuyệt đối; nếu xảy ra sự cố lộ lọt dữ liệu ảnh hưởng tới bạn, chúng tôi sẽ thông báo cho bạn và cơ quan có thẩm quyền theo quy định pháp luật.',
          ],
        },
        {
          id: 'age',
          title: '8. Độ tuổi',
          body: [
            'Dịch vụ dành cho người từ 18 tuổi trở lên. Chúng tôi không cố ý thu thập dữ liệu của người dưới 18 tuổi. Nếu bạn biết một người dưới 18 tuổi đã tạo tài khoản, hãy báo cho chúng tôi qua email để chúng tôi xoá tài khoản và dữ liệu đó.',
          ],
        },
        {
          id: 'rights',
          title: '9. Quyền của bạn',
          body: [
            'Theo pháp luật Việt Nam về bảo vệ dữ liệu cá nhân, bạn có quyền:',
            [
              'Được biết về việc xử lý dữ liệu của mình (chính là Chính sách này).',
              'Xem và chỉnh sửa thông tin cá nhân trong phần Cài đặt tài khoản.',
              'Tải về bản sao dữ liệu của mình (Cài đặt → Quyền riêng tư → Xuất dữ liệu).',
              'Xoá tài khoản (Cài đặt → Quyền riêng tư → Xoá tài khoản) hoặc yêu cầu xoá một phần dữ liệu.',
              'Rút lại sự đồng ý, phản đối hoặc yêu cầu hạn chế việc xử lý.',
              'Khiếu nại, tố cáo, yêu cầu bồi thường theo quy định pháp luật.',
            ],
            'Với các yêu cầu không làm được ngay trong ứng dụng, hãy gửi email tới kusshoes@gmail.com từ địa chỉ email của tài khoản. Chúng tôi phản hồi trong vòng 7 ngày làm việc.',
          ],
        },
        {
          id: 'changes',
          title: '10. Thay đổi chính sách',
          body: [
            'Khi thay đổi nội dung quan trọng, chúng tôi sẽ thông báo trên ứng dụng hoặc qua email và đề nghị bạn đồng ý lại trước khi tiếp tục sử dụng. Phiên bản và ngày hiệu lực được ghi ở đầu trang.',
          ],
        },
        {
          id: 'contact',
          title: '11. Liên hệ',
          body: ['Mọi câu hỏi về quyền riêng tư: kusshoes@gmail.com. ' + OPERATOR_VI],
        },
      ],
    },
    terms: {
      title: 'Điều khoản dịch vụ',
      intro:
        'Điều khoản này là thoả thuận giữa bạn và KusShoes khi bạn dùng trang web kusshoes.vercel.app, ứng dụng Android KusShoes và KusStudio Desktop (gọi chung là "Dịch vụ"). Bằng việc tick ô đồng ý khi đăng ký hoặc tiếp tục sử dụng Dịch vụ, bạn chấp nhận Điều khoản này và Chính sách bảo mật.',
      sections: [
        { id: 'operator', title: '1. Về KusShoes', body: [OPERATOR_VI, 'Dịch vụ đang trong giai đoạn thử nghiệm (beta); tính năng có thể thay đổi, tạm ngừng hoặc gặp lỗi.'] },
        {
          id: 'service',
          title: '2. Dịch vụ',
          body: [
            'KusShoes cho phép bạn quay video 360° đôi giày bằng ứng dụng Android, dựng mô hình 3D thông qua dịch vụ KIRI Engine, lưu thành dự án, xem và quản lý trên web, rồi chỉnh sửa (cắt gọn mô hình, thêm sticker, chữ) và xuất file GLB/OBJ bằng KusStudio Desktop trên Windows.',
            'Chất lượng mô hình 3D phụ thuộc vào video quét (ánh sáng, góc quay, bề mặt giày) và vào dịch vụ KIRI Engine; chúng tôi không bảo đảm mọi lượt quét đều cho kết quả dùng được.',
          ],
        },
        {
          id: 'account',
          title: '3. Tài khoản',
          body: [
            [
              'Bạn phải từ 18 tuổi trở lên.',
              'Thông tin đăng ký phải chính xác; mỗi tài khoản dành cho một người.',
              'Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động dưới tài khoản của mình. Hãy báo ngay cho chúng tôi nếu phát hiện truy cập trái phép.',
            ],
          ],
        },
        {
          id: 'plans',
          title: '4. Gói dịch vụ và thanh toán',
          body: [
            [
              'Có gói miễn phí và các gói trả phí theo tháng; giá và quyền lợi từng gói được niêm yết tại trang Bảng giá (https://kusshoes.vercel.app/pricing) tại thời điểm bạn mua.',
              'Thanh toán qua PayOS. Chúng tôi không lưu thẻ và không tự động gia hạn: khi gói sắp hết hạn, bạn nhận email nhắc và tự quyết định có gia hạn hay không.',
              'Credit quét lẻ có hạn dùng 12 tháng kể từ ngày mua.',
            ],
          ],
        },
        {
          id: 'refund',
          title: '5. Hoàn tiền',
          body: [
            [
              'Hoàn toàn bộ nếu bạn đã thanh toán nhưng gói không được kích hoạt do lỗi của hệ thống, hoặc bạn bị trừ tiền hai lần cho cùng một giao dịch.',
              'Hoàn toàn bộ nếu bạn yêu cầu trong vòng 7 ngày kể từ ngày thanh toán và chưa sử dụng quyền lợi trả phí nào của gói (chưa quét, chưa xuất file bằng hạn mức của gói).',
              'Ngoài các trường hợp trên, chúng tôi không hoàn tiền cho khoảng thời gian gói đã được sử dụng. Credit quét đã dùng không được hoàn.',
              'Gửi yêu cầu hoàn tiền tới kusshoes@gmail.com kèm mã hoá đơn. Chúng tôi xử lý trong vòng 7 ngày làm việc và hoàn qua kênh bạn đã thanh toán (PayOS).',
            ],
          ],
        },
        {
          id: 'content',
          title: '6. Nội dung của bạn',
          body: [
            'Bạn giữ toàn bộ quyền sở hữu với video, mô hình 3D và thiết kế của mình. Bạn cho phép KusShoes lưu trữ, xử lý (bao gồm gửi video tới KIRI Engine để dựng 3D) và hiển thị nội dung đó ở mức cần thiết để cung cấp Dịch vụ cho bạn, và hiển thị cho người khác khi bạn tự chia sẻ bằng link hoặc mã QR. Sự cho phép này chấm dứt khi bạn xoá nội dung hoặc tài khoản (theo thời hạn ở mục 6 của Chính sách bảo mật).',
            'Chúng tôi không dùng nội dung của bạn để quảng cáo, giới thiệu hoặc huấn luyện trí tuệ nhân tạo nếu không có sự đồng ý riêng của bạn.',
            'Bạn cam kết có quyền đối với những gì bạn tải lên, và chịu trách nhiệm nếu thiết kế của bạn sử dụng nhãn hiệu, logo, hình ảnh hoặc tác phẩm của người khác (ví dụ logo của hãng giày) mà không được phép.',
          ],
        },
        {
          id: 'rules',
          title: '7. Hành vi bị cấm',
          body: [
            [
              'Tải lên hoặc chia sẻ nội dung vi phạm pháp luật Việt Nam, xâm phạm quyền sở hữu trí tuệ, quyền riêng tư của người khác, hoặc có tính chất khiêu dâm, bạo lực, kích động, thù ghét.',
              'Quay video có mặt hoặc thông tin cá nhân của người khác mà không được họ đồng ý.',
              'Tìm cách truy cập trái phép, dò quét, làm quá tải hoặc phá hoại Dịch vụ; dùng công cụ tự động để lạm dụng hạn mức.',
              'Mua bán, chuyển nhượng tài khoản hoặc dùng Dịch vụ để lừa đảo.',
            ],
          ],
        },
        {
          id: 'moderation',
          title: '8. Kiểm duyệt và khiếu nại bản quyền',
          body: [
            'Khi có báo cáo vi phạm hoặc khiếu nại bản quyền hợp lệ gửi tới kusshoes@gmail.com, chúng tôi xem xét và có thể gỡ nội dung liên quan. Vi phạm được xử lý theo ba mức, không bỏ qua mức nào: (1) cảnh báo; (2) cấm chia sẻ công khai trong 30 ngày; (3) khoá tài khoản.',
          ],
        },
        {
          id: 'termination',
          title: '9. Chấm dứt',
          body: [
            'Bạn có thể xoá tài khoản bất cứ lúc nào trong Cài đặt → Quyền riêng tư; tài khoản khôi phục được trong 30 ngày, sau đó dữ liệu bị xoá theo Chính sách bảo mật. Chúng tôi có thể tạm khoá hoặc chấm dứt tài khoản vi phạm Điều khoản này theo mục 8.',
          ],
        },
        {
          id: 'liability',
          title: '10. Giới hạn trách nhiệm',
          body: [
            'Dịch vụ được cung cấp theo hiện trạng trong giai đoạn thử nghiệm. Trong phạm vi pháp luật cho phép, KusShoes không chịu trách nhiệm cho thiệt hại gián tiếp phát sinh từ việc gián đoạn Dịch vụ, lỗi của dịch vụ bên thứ ba (như KIRI Engine, PayOS) hoặc chất lượng mô hình 3D. Trách nhiệm của chúng tôi đối với mỗi khoản thanh toán không vượt quá số tiền bạn đã trả cho khoản đó. Điều khoản này không hạn chế các quyền của bạn với tư cách người tiêu dùng theo pháp luật Việt Nam.',
          ],
        },
        {
          id: 'law',
          title: '11. Luật áp dụng và giải quyết tranh chấp',
          body: [
            'Điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp trước hết được giải quyết bằng thương lượng qua kusshoes@gmail.com; nếu không thành, một trong hai bên có thể đưa ra toà án có thẩm quyền tại TP. Hồ Chí Minh.',
          ],
        },
        {
          id: 'changes',
          title: '12. Thay đổi điều khoản',
          body: [
            'Khi thay đổi nội dung quan trọng, chúng tôi thông báo trên ứng dụng hoặc qua email và đề nghị bạn đồng ý lại trước khi tiếp tục sử dụng.',
          ],
        },
        { id: 'contact', title: '13. Liên hệ', body: ['kusshoes@gmail.com. ' + OPERATOR_VI] },
      ],
    },
  },
  en: {
    privacy: {
      title: 'Privacy Policy',
      intro:
        'This policy explains what KusShoes collects when you use kusshoes.vercel.app, the KusShoes Android app (vn.kusshoes.mobile) and KusStudio Desktop (KusShoes Editor), what we use it for, who we share it with, how long we keep it and what rights you have. The Vietnamese version prevails if the two differ.',
      sections: [
        { id: 'operator', title: '1. Who is responsible for your data', body: [OPERATOR_EN] },
        {
          id: 'collect',
          title: '2. Data we collect',
          body: [
            'Data you provide:',
            [
              'Account: email, password (stored only as a one-way bcrypt hash that we cannot read), name, username.',
              'Profile (optional): avatar, phone number, bio, studio details, social media handles, language and style preferences.',
              'Security (if you enable it): two-factor authentication settings, recovery email.',
              'Content: shoe scan videos, 3D models reconstructed from them, designs (stickers, text, colours), project thumbnails and the files you export.',
              'Feedback and abuse reports you send us.',
            ],
            'Data recorded automatically:',
            [
              'Sign-in history: time, IP address, browser/device type, success or failure.',
              'If you sign in with Google: your Google account ID, email and name from your Google profile.',
              'Referral source, if any (UTM parameters, referral code).',
              'Plan and invoice details: plan, amount, payment status. We never receive or store your card or bank account details.',
            ],
            'The Android app only asks for Camera (to record the shoe video) and Internet. Videos are recorded without sound.',
          ],
        },
        {
          id: 'purpose',
          title: '3. What we use data for',
          body: [
            [
              'Creating and running your account: sign-in, two-factor authentication, password recovery.',
              'Reconstructing 3D models from scan videos, storing and showing your projects on the web, the Android app and KusStudio Desktop.',
              'Processing payments, invoices, renewal reminders and refunds.',
              'Sending account emails: verification codes, password resets, invoices, renewal reminders.',
              'Protecting the service: detecting unusual sign-ins, preventing abuse, handling abuse reports and copyright complaints.',
            ],
            'We do not use advertising cookies or third-party trackers, we do not sell your data, and we do not send marketing emails. If we ever want analytics or marketing emails, we will update this policy and ask for your consent first.',
            'We do not use your videos, models or designs for advertising or to train artificial intelligence unless you consent separately in each case.',
          ],
        },
        {
          id: 'basis',
          title: '4. Legal basis',
          body: [
            'We process data based on the consent you give at sign-up (ticking the box confirming you are 18 or older and agree to the Terms of Service and this Policy) and to provide the service you asked for. You can withdraw consent at any time (section 9); we then cannot keep providing the parts of the service that need that data.',
          ],
        },
        {
          id: 'share',
          title: '5. Who we share data with',
          body: [
            'We use the providers below to run the service. Each receives only what it needs:',
            [
              'KIRI Engine (KIRI Innovation): receives your scan video to reconstruct the 3D model. Videos are processed on KIRI servers outside Vietnam under their policy: https://www.kiriengine.app/privacy-policy. As soon as KIRI accepts a video, we delete our copy.',
              'Neon: database (servers in Singapore).',
              'Google Cloud Platform: application server (Singapore).',
              'Cloudflare R2: file storage (videos before they go to KIRI, 3D models, images, exports).',
              'Vercel: hosts the website.',
              'Google: Sign in with Google (if you choose it).',
              'Gmail (Google): sends you email.',
              'PayOS: payment processing; payment details you enter are handled directly by PayOS and your bank.',
            ],
            'International transfers: most of these providers operate servers outside Vietnam (Singapore and other countries), so your data is transferred and processed abroad. By agreeing to this Policy you consent to that transfer for running the service.',
            'We disclose data to authorities only when legally required under Vietnamese law.',
            'When you create a share link or QR code (Artisan), anyone with the link can view and download the shared model until you revoke the link on the project page.',
          ],
        },
        {
          id: 'retention',
          title: '6. How long we keep data',
          body: [
            [
              'Account and project data: for as long as you use the service.',
              'Scan videos: deleted from our storage as soon as KIRI Engine accepts them for processing.',
              'Sign-in history (with IP): 90 days, then deleted automatically.',
              'Projects you delete: kept in Trash for 30 days so you can restore them, then permanently deleted with their files.',
              'Accounts you delete: restorable for 30 days; after that all projects and files are deleted and the personal data in the account is anonymised.',
              'Invoices: kept for accounting obligations even after your account is deleted.',
            ],
          ],
        },
        {
          id: 'security',
          title: '7. Security',
          body: [
            'All connections use HTTPS. Passwords are stored as one-way bcrypt hashes. Your files are stored on Cloudflare R2 under random, unguessable names. You can enable two-factor authentication. No system is perfectly secure; if a data breach affects you, we will notify you and the competent authorities as required by law.',
          ],
        },
        {
          id: 'age',
          title: '8. Age',
          body: [
            'The service is for people aged 18 or older. We do not knowingly collect data from anyone under 18. If you know that someone under 18 created an account, email us and we will delete that account and its data.',
          ],
        },
        {
          id: 'rights',
          title: '9. Your rights',
          body: [
            'Under Vietnamese personal data protection law you have the right to:',
            [
              'Be informed about how your data is processed (this Policy).',
              'View and correct your personal information in Account settings.',
              'Download a copy of your data (Settings → Privacy → Export data).',
              'Delete your account (Settings → Privacy → Delete account) or ask us to delete part of your data.',
              'Withdraw consent, object to or ask us to restrict processing.',
              'Complain, report and claim compensation as provided by law.',
            ],
            'For anything you cannot do in the app, email kusshoes@gmail.com from your account email. We respond within 7 working days.',
          ],
        },
        {
          id: 'changes',
          title: '10. Changes',
          body: [
            'For material changes we will notify you in the app or by email and ask you to agree again before you continue. The version and effective date are shown at the top of this page.',
          ],
        },
        { id: 'contact', title: '11. Contact', body: ['Privacy questions: kusshoes@gmail.com. ' + OPERATOR_EN] },
      ],
    },
    terms: {
      title: 'Terms of Service',
      intro:
        'These Terms are an agreement between you and KusShoes for using kusshoes.vercel.app, the KusShoes Android app and KusStudio Desktop (together, the "Service"). By ticking the consent box at sign-up or continuing to use the Service, you accept these Terms and the Privacy Policy. The Vietnamese version prevails if the two differ.',
      sections: [
        { id: 'operator', title: '1. About KusShoes', body: [OPERATOR_EN, 'The Service is in beta; features may change, pause or break.'] },
        {
          id: 'service',
          title: '2. The Service',
          body: [
            'KusShoes lets you record a 360° video of a shoe with the Android app, reconstruct a 3D model through the KIRI Engine service, save it as a project, view and manage it on the web, then edit it (crop the model, add stickers and text) and export GLB/OBJ files with KusStudio Desktop on Windows.',
            'Model quality depends on the scan video (lighting, angles, shoe surface) and on KIRI Engine; we do not guarantee that every scan produces a usable result.',
          ],
        },
        {
          id: 'account',
          title: '3. Your account',
          body: [
            [
              'You must be 18 or older.',
              'Registration details must be accurate; one account per person.',
              'You are responsible for keeping your password secret and for all activity under your account. Tell us immediately about any unauthorised access.',
            ],
          ],
        },
        {
          id: 'plans',
          title: '4. Plans and payment',
          body: [
            [
              'There is a free plan and monthly paid plans; prices and entitlements are those listed on the Pricing page (https://kusshoes.vercel.app/pricing) when you buy.',
              'Payments go through PayOS. We do not store cards and never auto-renew: before a plan expires you get a reminder email and decide whether to renew.',
              'Single scan credits are valid for 12 months from purchase.',
            ],
          ],
        },
        {
          id: 'refund',
          title: '5. Refunds',
          body: [
            [
              'Full refund if you paid but the plan was not activated because of a system error, or you were charged twice for the same transaction.',
              'Full refund if you ask within 7 days of payment and have not used any paid entitlement of the plan (no scans or exports counted against the plan).',
              'Otherwise we do not refund time already used. Used scan credits are not refundable.',
              'Send refund requests to kusshoes@gmail.com with the invoice number. We process them within 7 working days and refund through the channel you paid with (PayOS).',
            ],
          ],
        },
        {
          id: 'content',
          title: '6. Your content',
          body: [
            'You keep full ownership of your videos, 3D models and designs. You allow KusShoes to store, process (including sending videos to KIRI Engine for reconstruction) and display that content as needed to provide the Service to you, and to show it to others when you share it by link or QR code. This permission ends when you delete the content or your account (per section 6 of the Privacy Policy).',
            'We do not use your content for advertising, showcases or AI training without your separate consent.',
            'You confirm you have the rights to what you upload and are responsible if your designs use trademarks, logos, images or works of others (for example a shoe brand logo) without permission.',
          ],
        },
        {
          id: 'rules',
          title: '7. Prohibited use',
          body: [
            [
              'Uploading or sharing content that breaks Vietnamese law, infringes intellectual property or privacy, or is sexually explicit, violent, inciting or hateful.',
              'Recording other people or their personal information without their consent.',
              'Attempting unauthorised access, scanning, overloading or disrupting the Service; using automation to abuse quotas.',
              'Selling or transferring accounts, or using the Service for fraud.',
            ],
          ],
        },
        {
          id: 'moderation',
          title: '8. Moderation and copyright complaints',
          body: [
            'When a valid abuse report or copyright complaint reaches kusshoes@gmail.com, we review it and may remove the content. Violations are handled in three steps, none skipped: (1) warning; (2) no public sharing for 30 days; (3) account suspension.',
          ],
        },
        {
          id: 'termination',
          title: '9. Termination',
          body: [
            'You can delete your account at any time in Settings → Privacy; it can be restored for 30 days, after which data is deleted per the Privacy Policy. We may suspend or terminate accounts that break these Terms under section 8.',
          ],
        },
        {
          id: 'liability',
          title: '10. Limitation of liability',
          body: [
            'The Service is provided as is during beta. To the extent permitted by law, KusShoes is not liable for indirect damages from service interruptions, failures of third-party services (such as KIRI Engine or PayOS) or 3D model quality. Our liability for any payment is limited to the amount you paid for it. Nothing here limits your rights as a consumer under Vietnamese law.',
          ],
        },
        {
          id: 'law',
          title: '11. Governing law and disputes',
          body: [
            'These Terms are governed by Vietnamese law. Disputes are first negotiated via kusshoes@gmail.com; failing that, either party may bring them before the competent court in Ho Chi Minh City.',
          ],
        },
        {
          id: 'changes',
          title: '12. Changes',
          body: [
            'For material changes we will notify you in the app or by email and ask you to agree again before you continue.',
          ],
        },
        { id: 'contact', title: '13. Contact', body: ['kusshoes@gmail.com. ' + OPERATOR_EN] },
      ],
    },
  },
};
