# Tipi

Ứng dụng quản lý lịch hẹn và thu chi cho tiệm nail & makeup Tipi.

## Triển khai online

Hosting: **Cloudflare Pages**. Đăng nhập, dữ liệu và ảnh riêng tư: **Supabase**.

Kết nối repository với Cloudflare Pages để máy chủ tự build và triển khai. Không cần chạy ứng dụng trên máy cá nhân.

| Cấu hình Pages | Giá trị |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | Gốc repository |
| Node.js | `22` (được khai báo trong `.node-version`) |

Đặt `TIPI_SUPABASE_URL` và `TIPI_SUPABASE_PUBLISHABLE_KEY` trong môi trường build của Pages. Xem [hướng dẫn triển khai](DEPLOY.md) để cấu hình Supabase và cấp quyền chủ tiệm.

**Không triển khai trực tiếp thư mục gốc:** `index.html` ở gốc là bản cũ lưu dữ liệu trong trình duyệt. Bản có đăng nhập được tạo vào `dist` khi build.

## Phạm vi hiện tại

- Quản lý lịch nail/makeup, ảnh mẫu, hủy lịch và xem lịch đã hủy.
- Tổng quan, lịch ngày/tuần, tổng hợp lịch ngày mai và quản lý thu chi.
- Đăng nhập email/Google qua Supabase và giới hạn dữ liệu theo chủ tiệm.
- Sao lưu và khôi phục thủ công bằng file trên thiết bị.

Google Calendar, Google Sheets và chức năng liên kết Google riêng cho tài khoản email chưa được triển khai. Bật đăng nhập Google không tự bật các chức năng đồng bộ này.

## Bảo mật

Không commit `.env.local`, khóa riêng SSH, Supabase Secret/service_role, Google client secret hoặc file sao lưu chứa dữ liệu khách. `.env.example` chỉ chứa giá trị mẫu. `dist` và `node_modules` được tạo lại trên máy chủ, không cần đưa lên GitHub.
