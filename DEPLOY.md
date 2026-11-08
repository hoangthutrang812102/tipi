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

## Bản nâng cấp: hai tài khoản và đồng bộ Google

Bản Tipi online hiện dùng Cloudflare **Workers**. Trong Workers Builds, giữ build
command `npm ci && npm run build` và đổi deploy command thành
`npx --yes wrangler deploy` để đọc `wrangler.jsonc`. Production worker là
`tipi`; cấu hình này phục vụ `dist` và chạy cron đồng bộ mỗi 5 phút. Giữ nguyên
hai biến build Supabase. Không bật preview tự động cho môi trường production.

### Chuyển quyền mà không chuyển dữ liệu

1. Tải bản ZIP sao lưu trên bản đang chạy. Kiểm tra số lịch hẹn, thu chi và ảnh.
2. Chạy migration
   [20261108000200_tipi_team_google.sql](supabase/migrations/20261108000200_tipi_team_google.sql)
   trong Supabase SQL Editor. Migration giữ nguyên hàng dữ liệu và đường dẫn ảnh.
   Bản frontend cũ vẫn dùng được bằng tài khoản đang hoạt động.
3. Cho Phương đăng nhập bằng Google một lần. Nếu chưa được cấp quyền, Tipi sẽ từ
   chối vào màn hình chính nhưng Supabase có thể đã tạo tài khoản. Nếu OAuth đang
   giới hạn người thử, kiểm tra danh sách test users trong Google Cloud.
4. Trong Supabase Authentication → Users, xác nhận đúng email Google của Phương,
   đã xác minh, rồi lấy UID. Chạy câu lệnh sau với UID và email đã kiểm tra:

```sql
insert into private.tipi_members(user_id, role)
select id, 'owner' from auth.users
where id = 'UID_CUA_PHUONG'
  and lower(email) = lower('EMAIL_GOOGLE_CUA_PHUONG')
  and email_confirmed_at is not null
returning user_id, role;
```

   Phải nhận đúng một dòng. Tài khoản cũ là quản trị hỗ trợ, không được quản lý
   kết nối Google. Không xóa tài khoản cũ hoặc đổi UID trong `private.tipi_owner`:
   nó vẫn là mã kho dữ liệu và ảnh, không phải vai trò chủ tiệm mới. Migration
   chặn xóa tài khoản gốc để tránh làm mất dữ liệu.
5. Kiểm tra cả hai tài khoản nhìn thấy cùng lịch/ảnh và người ngoài bị từ chối.

### Google Cloud và Worker

Tạo OAuth client loại Web Application **riêng cho tích hợp** (không sửa client
đang dùng đăng nhập Supabase). Bật Google Calendar API, Google Sheets API và
Google Drive API. Thêm Authorized redirect URI chính xác:

```text
https://tipi.thutrangk21thd.workers.dev/api/google/callback
```

Chọn phạm vi quyền tối thiểu: `calendar.app.created` cho lịch riêng do Tipi tạo,
`drive.file` cho các file Google Sheets của Tipi, và `openid email` để kiểm tra
đúng tài khoản đã xác minh. Kiểm tra trạng thái phát hành và yêu cầu xác minh
trước khi dùng lâu dài. Với ứng dụng External ở Testing, refresh token cho
quyền đồng bộ có thể hết hạn sau 7 ngày.

Trong **Cloudflare Worker → Settings → Variables and Secrets** (runtime, không
chỉ mục Builds), cấu hình:

| Tên | Giá trị |
| --- | --- |
| `TIPI_ORIGIN` | `https://tipi.thutrangk21thd.workers.dev` không có dấu / cuối |
| `TIPI_SUPABASE_URL` | Project URL Supabase |
| `TIPI_SUPABASE_PUBLISHABLE_KEY` | Publishable key của cùng project |
| `TIPI_SUPABASE_SERVER_KEY` | **Secret**, Supabase secret key hoặc legacy service_role |
| `GOOGLE_CLIENT_ID` | Client ID riêng của tích hợp |
| `GOOGLE_CLIENT_SECRET` | **Secret**, client secret riêng của tích hợp |
| `TIPI_GOOGLE_ENCRYPTION_KEY` | **Secret**, 32 byte ngẫu nhiên dưới dạng 64 ký tự hex |

Có thể dùng trình quản lý mật khẩu sinh 64 ký tự hex ngẫu nhiên, hoặc
`openssl rand -hex 32`. Không dùng lại secret khác. Đổi khóa mã hóa sẽ khiến
token cũ không đọc được; cần quy trình xoay khóa riêng. Tuyệt đối không đưa các
secret trên vào biến frontend hoặc GitHub.

Sau khi deploy, **Phương** vào **Cài đặt → Kết nối Google**, chọn Calendar/Sheets
và tự cấp quyền bằng đúng email của mình. Không cần cung cấp mật khẩu. Kiểm tra
Cron Triggers trên Worker và chờ một lượt đồng bộ. Đăng nhập Tipi và cấp quyền
đồng bộ là hai bước khác nhau.

### Vận hành đồng bộ

- Calendar: chỉ đưa lịch chưa hủy từ hôm nay trở đi khi chưa có sự kiện. Sự kiện
  đã quản lý tiếp tục được sửa hoặc gỡ khi hủy; lịch cá nhân không bị sửa. Không
  đưa tên, số điện thoại, ảnh và ghi chú khách vào Calendar. Tiêu đề phân biệt
  Nail/Makeup và giờ theo Việt Nam.
- Sheets: một file mỗi tháng, tab tổng quan và tuần thứ Hai–Chủ nhật. Tuần giao
  tháng chỉ chứa ngày trong tháng đó. Sửa ngày sang tháng khác cập nhật cả hai
  file. Không ghi tay vào vùng A:G của các tab Tipi; dùng tab khác nếu cần. File
  thuộc Google của Phương; Tipi không tự cấp quyền chia sẻ Drive cho quản trị.
- Đồng bộ một chiều. Nút **Đồng bộ lại** yêu cầu đối soát tất cả tháng đã quản
  lý và lịch phù hợp ở lượt cron tiếp theo. Đợt lớn có thể cần nhiều lượt.
  Không ảnh hưởng đến việc lưu dữ liệu trong Tipi.
- Ngắt kết nối giữ lại lịch và file Google đã tạo; không sao lưu lên Drive.
- Nếu báo chưa xác định được lịch đã tạo, quản trị kiểm tra tài khoản Google và
  log của lần gọi API trước khi xử lý trạng thái. Không tự tạo lịch thứ hai khi
  chưa rõ kết quả của lần tạo đầu.
