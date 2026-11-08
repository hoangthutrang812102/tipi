# Triển khai Tipi trên Cloudflare Pages và Supabase

## Triển khai từ GitHub, không cần chạy localhost

1. Đăng nhập Cloudflare Dashboard, vào **Workers & Pages → Create application → Pages → Connect to Git**. Chọn luồng Pages, không phải triển khai Worker.
2. Kết nối GitHub và chỉ cấp quyền cho repository `hoangthutrang812102/tipi`.
3. Chọn production branch `main`, framework preset `None`, để root directory ở gốc repository.
4. Đặt build command là `npm ci && npm run build`, build output directory là `dist`. File `.node-version` yêu cầu Node.js 22; cũng có thể đặt biến build `NODE_VERSION=22`.
5. Thêm hai biến build bên dưới vào môi trường Production, rồi chọn **Save and Deploy**. Nếu dùng Preview, khai báo biến và URL đăng nhập riêng phù hợp cho môi trường đó.
6. Sau khi build thành công, dùng URL HTTPS `*.pages.dev` mà Cloudflare cấp. Không cần mua tên miền hoặc mở localhost.

| Biến build | Giá trị |
| --- | --- |
| `TIPI_SUPABASE_URL` | Project URL của Supabase |
| `TIPI_SUPABASE_PUBLISHABLE_KEY` | Publishable key của cùng project, bắt đầu bằng `sb_publishable_` |

Hai biến này được nhúng vào bản frontend khi build. **Không dùng khóa Secret hoặc service_role.** Khi đổi biến, cần build/deploy lại. `.env.local` chỉ dùng cho phát triển, không được đưa lên GitHub.

**Chỉ phục vụ thư mục `dist`.** Thư mục gốc vẫn là bản cũ dùng dữ liệu trong trình duyệt và không có cổng đăng nhập cloud.

Tài liệu chính thức: [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Node.js/build image](https://developers.cloudflare.com/pages/configuration/build-image/).

## Database và tài khoản chủ tiệm

1. Kiểm tra migration `supabase/migrations/20261108000100_tipi_owner_data.sql` đã được áp dụng đầy đủ chưa. Migration này chỉ chạy một lần trên project mới, không chạy lại nếu các bảng/policy đã tồn tại. Với project đã có bảng `tipi_state`, cần kiểm tra cả hàm `tipi_is_owner`, bảng `private.tipi_owner`, quyền truy cập và bucket `tipi-images` trước khi tiếp tục.
2. Trong Supabase Authentication → URL Configuration, đặt Site URL thành địa chỉ chính thức của Tipi. Thêm URL thử nghiệm cụ thể và URL đặt lại mật khẩu có `?recovery=1` vào danh sách redirect nếu cần. Giữ Google OAuth callback trỏ tới Supabase.
3. Bật xác nhận email khi đăng ký bằng mật khẩu. Cấu hình SMTP để gửi thư xác nhận và đặt lại mật khẩu khi dùng chính thức.
4. Đăng nhập thử bằng Google trên bản web. Supabase sẽ tạo người dùng. Tipi báo chưa được cấp quyền ở lần đầu.
5. Trong Authentication → Users, kiểm tra email đã xác minh và lấy User UID của chủ tiệm. Chạy câu sau với UID đã kiểm tra. Bảng chỉ nhận một chủ tiệm.

```sql
insert into private.tipi_owner (user_id)
values ('OWNER_USER_UUID');
```

6. Đăng nhập lại. Kiểm tra tạo, sửa, hủy lịch và ghi thu chi. Mở cùng tài khoản trên thiết bị thứ hai để kiểm tra dữ liệu. Thử một tài khoản khác để xác nhận quyền truy cập bị từ chối.

## Chuyển dữ liệu

Mở bản cũ tại địa chỉ bạn từng dùng. Trong Cài đặt, chọn **Xuất dữ liệu sang Tipi web**. Trên bản mới, đăng nhập và chọn **Khôi phục từ file**, rồi chọn file JSON đã xuất. Xem số lượng bản ghi trước khi xác nhận. Nếu dữ liệu nằm ngay tại địa chỉ của bản mới, dùng **Nhập dữ liệu cũ trên thiết bị**.

**Tải bản sao lưu** tạo file ZIP để cất trên thiết bị. File chứa thông tin khách, ảnh mẫu và thu chi, nên lưu ở nơi riêng tư. Khôi phục sẽ thay dữ liệu hiện tại sau xác nhận và tạo bản tải xuống của dữ liệu trước khi thay thế.

## Phạm vi hiện tại

Migration tạo kho ảnh riêng tư và khóa quyền theo UID của chủ tiệm. Dữ liệu được lưu theo phiên bản để lần lưu trên thiết bị cũ không ghi đè dữ liệu mới. Tải lại trang để lấy bản mới nhất. Google Calendar, Google Sheets và liên kết Google riêng cho tài khoản email cần phần kết nối và đồng bộ riêng, chưa có trong bản này.
