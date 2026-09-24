# CareerAssistantAI – Website giới thiệu đề tài NCKH

Website tĩnh (HTML/CSS/JS thuần) gồm 4 mục: **Trang chủ**, **Số liệu thống kê**, **Góc nhìn học sinh & chuyên gia**, **Chatbot AI**. Chatbot có 2 chế độ:

- **Hỏi đáp có sẵn (FAQ)** – luôn hoạt động, không cần backend.
- **Trợ lý AI (Claude)** – tự bật khi bạn tạo `api/config.php` với API key trên server.

## Cấu trúc

```
index.html            Trang duy nhất
assets/               CSS, JS, ảnh
data/survey.json      Số liệu khảo sát tổng hợp (tạo bằng tools/build_survey.rb)
data/data.json        Chatbot FAQ, trích dẫn, nhóm nghiên cứu
tools/build_survey.rb Script tổng hợp file Excel khảo sát → survey.json
api/chat.php          Proxy gọi Claude API (giữ API key phía server)
api/admin.php         Trang quản trị tài khoản (thống kê, đặt lại mật khẩu, xóa)
api/auth.php          Đăng ký / đăng nhập bằng tên đăng nhập + mật khẩu (cấp cookie phiên)
api/history.php       Lưu / đọc / xóa lịch sử trò chuyện của người dùng đã đăng nhập
api/results.php       Lưu / đọc / xóa các lần làm trắc nghiệm Holland của người dùng đã đăng nhập
api/config.sample.php Mẫu cấu hình (config.php thật KHÔNG được commit)
.htaccess             HTTPS, header bảo mật, cache (Apache/LiteSpeed của Hostinger)
```

## 1. Cập nhật dữ liệu

- **Số liệu khảo sát** (`data/survey.json`) được tạo tự động từ file Excel, chỉ chứa số liệu tổng hợp (không có từng phiếu trả lời). Khi có file khảo sát mới:

  ```bash
  ruby tools/build_survey.rb "/đường/dẫn/KHAOSAT.xlsx" data/survey.json
  ```

  Script tính sẵn số liệu cho mọi tổ hợp bộ lọc (khối 10/11/12 × nam/nữ). Các biểu đồ, tiêu đề và câu hỏi nằm trong `tools/build_survey.rb` (phần `sections`). **Không commit file `.xlsx` lên GitHub.**
- **Nội dung khác** (`data/data.json`): chatbot (FAQ), góc nhìn học sinh/chuyên gia (hiện là nội dung mẫu), nhóm nghiên cứu. Với FAQ, `keywords` viết **không dấu, chữ thường**.
- Sửa thêm tiêu đề/mô tả trong `index.html` cho khớp đề tài.

## Trắc nghiệm Holland

- **Hai chế độ** (học sinh chọn ở màn hình đầu): **bản rút gọn 36 câu** (mỗi nhóm 6 câu, điểm 6–30, khoảng 5 phút) và **bản đầy đủ 60 câu** (mỗi nhóm 10 câu, điểm 10–50, khoảng 10 phút). 36 câu của bản rút gọn nằm trọn trong bản đầy đủ; 24 câu thêm được đánh dấu `"f": 1` trong `data/holland.json`. Biểu đồ luôn quy về thang 0–100% nên hai bản xem được như nhau.
- Bộ câu hỏi, mô tả nhóm tính cách và gợi ý ngành nằm trong `data/holland.json` (nhóm tự soạn, **cần giáo viên hướng dẫn duyệt**). Điểm được chấm ngay trên trình duyệt.
- **Phân tích bằng AI**: dùng `api/chat.php` (chỉ nhận 6 điểm số nguyên và số câu mỗi nhóm `holland_n` = 6 hoặc 10, không nhận văn bản tự do). Cần đã bật chatbot AI.
- **Xuất PDF**: nút "Tải kết quả (PDF)" mở hộp thoại in, chọn "Lưu dưới dạng PDF".
- **Gửi ẩn danh cho nghiên cứu** (chỉ khi học sinh tích đồng ý): `api/holland.php` ghi vào `api/storage/holland.jsonl` gồm ngày, khối, giới tính (nếu chọn), chế độ (`short`/`full`), 6 điểm số. Điểm của hai chế độ khác thang nên khi phân tích cần tách theo cột `mode` (hoặc quy về %). Không lưu tên, IP hay user-agent. Thư mục `api/storage/` bị chặn truy cập từ web và file dữ liệu không được commit.
- **Tải dữ liệu**: đặt `admin_password` trong `api/config.php`, rồi mở `https://<tên-miền>/api/holland_export.php` (tên đăng nhập `admin`) để tải CSV. Hoặc tải trực tiếp `api/storage/holland.jsonl` qua File Manager của hPanel.
- Vì đối tượng là học sinh THPT, nên xin phép nhà trường/phụ huynh theo quy định trước khi thu thập dữ liệu.

## Tài khoản (tên đăng nhập + mật khẩu) và lịch sử trò chuyện

Bấm icon tròn ở góc phải thanh trên để **tạo tài khoản** hoặc **đăng nhập**. Người dùng tự chọn tên đăng nhập và mật khẩu, không cần email hay dịch vụ bên ngoài. Khi đã đăng nhập, mọi lượt hỏi – đáp với chatbot **và mọi lần làm trắc nghiệm Holland** được lưu trên máy chủ và tự hiện lại lần sau (trên mọi thiết bị); bảng tài khoản có nút **Xóa lịch sử trò chuyện**, **Xóa kết quả Holland đã lưu** và **Đăng xuất**. Chưa đăng nhập thì chatbot vẫn dùng bình thường, chỉ không lưu lịch sử.

**Bật tính năng:** không cần cấu hình gì thêm. Chỉ cần PHP chạy được và thư mục `api/storage/` ghi được (giống phần trắc nghiệm Holland). Lần đầu có người đăng ký/đăng nhập, máy chủ tự tạo khóa ký phiên `api/storage/session.key`. Nếu thư mục không ghi được, bảng tài khoản sẽ báo "chưa được bật".

**Quy tắc và cách hoạt động:**
- Tên đăng nhập 3–30 ký tự (chữ cái không dấu, số, `.`, `_`, `-`), không phân biệt hoa/thường. Mật khẩu 8–72 ký tự và không trùng tên đăng nhập.
- `api/auth.php` chỉ lưu **mật khẩu đã băm bằng bcrypt** (`password_hash`), không lưu bản gốc, vào `api/storage/accounts/<mã băm>.json`. Đăng nhập thành công cấp cookie phiên ký HMAC, `HttpOnly`, `SameSite=Lax`, hiệu lực 30 ngày.
- Chống dò mật khẩu: tối đa 10 lần thử / 10 phút mỗi IP và 6 lần / 10 phút mỗi cặp IP + tên đăng nhập; đăng ký tối đa 5 tài khoản / giờ mỗi IP. Sai tên hay sai mật khẩu đều báo chung một thông báo.
- **Kết quả Holland đã lưu:** khi đã đăng nhập, làm xong bài (bản 36 hoặc 60 câu) là tự lưu vào tài khoản qua `api/results.php` (ngày, bản làm bài, 6 điểm số), tối đa 50 lần gần nhất. Ở màn hình đầu của trắc nghiệm có danh sách "Kết quả đã lưu" để xem lại (kèm biểu đồ, gợi ý ngành) hoặc xóa từng lần. Chưa đăng nhập thì kết quả chỉ nằm trên màn hình, có lời mời đăng nhập để lưu. Việc lưu này **tách biệt** với "Gửi kết quả ẩn danh cho nghiên cứu" (`api/holland.php`): bản gửi ẩn danh vẫn không gắn với tài khoản.
- `api/history.php` lưu tối đa 200 tin nhắn gần nhất mỗi tài khoản vào `api/storage/users/<mã băm>.json` (chỉ nội dung chat, không kèm tên đăng nhập). Thư mục `storage/` bị chặn truy cập từ web và không được commit.
- **Trang quản trị** `https://<tên-miền>/api/admin.php` (tên đăng nhập `admin`, mật khẩu là `admin_password` trong `api/config.php`, như trang tải CSV Holland). Hiển thị số tài khoản, và với mỗi tài khoản: tên đăng nhập, ngày tạo, số tin nhắn, số lần làm bài Holland đã lưu, lần trò chuyện gần nhất. **Không hiển thị mật khẩu (chỉ lưu bản băm), nội dung trò chuyện và điểm Holland của từng người.** Có hai thao tác: **Đặt lại mật khẩu** (tạo mật khẩu tạm mới, hiện một lần để gửi cho học sinh) và **Xóa** (kèm lịch sử trò chuyện và kết quả Holland đã lưu). Cả hai có hiệu lực ngay, phiên đăng nhập cũ của tài khoản đó bị thoát. Nhập sai mật khẩu quản trị quá 10 lần / 10 phút sẽ bị khóa tạm.
- **Chưa có "quên mật khẩu" tự động** (vì không thu email): học sinh quên thì nhờ quản trị viên đặt lại mật khẩu ở trang trên.
- Đăng xuất chỉ xóa cookie trên trình duyệt đó; muốn buộc mọi người đăng nhập lại, xóa `api/storage/session.key`.
- Người dùng là học sinh THPT: nên thông báo cho nhà trường/phụ huynh về việc lưu tài khoản và nội dung trò chuyện, tương tự phần trắc nghiệm Holland.
- Chạy thử trên máy cần PHP: `php -S localhost:8000` (không dùng `python -m http.server`).

## Video giới thiệu

Trang `video/` là video tự chạy (khoảng 68 giây) gồm 7 cảnh, phụ đề và **nhạc nền** (không có giọng đọc). Số liệu trong video đọc trực tiếp từ `data/survey.json`, `data/holland.json`, `data/data.json`.

- **Nhạc nền** là bản nhạc gốc do nhóm tạo bằng code (không dính bản quyền): phong cách sôi động, hồi hộp, huyền bí (giọng La thứ, khoảng 137 BPM): chuông vang xa, tiếng tíc đồng hồ, piano điện rải nốt dồn dập, bass, trống dồn; bố cục bám theo 7 cảnh (mở đầu bí ẩn, cao trào ở trắc nghiệm Holland, kết bằng hợp âm chủ). Tạo lại bằng `ruby tools/build_music.rb` (cần macOS). Chỉnh phong cách trong file này: `INTENSITY` (độ dày nhạc từng cảnh), `TEMPO_RANGE`, `AMP` (âm lượng từng nhạc cụ).
- Phụ đề và mốc thời gian nằm trong `video/timeline.json`; hình ảnh từng cảnh trong `video/video.js`.
- Để có file MP4: mở `video/`, chọn toàn màn hình, quay màn hình (Cmd + Shift + 5), rồi ghép với `video/music.m4a` trong iMovie hoặc CapCut.
- *Tùy chọn:* nếu sau này muốn thêm giọng đọc, có `tools/build_video.rb` (giọng máy), `tools/tts_cloud.rb` (giọng AI) và `video/voice/README.md` (thu giọng thật). Các công cụ này **ghi đè `timeline.json`** theo lời đọc mới, nên sau đó chạy lại `ruby tools/build_music.rb` nếu muốn nhạc nền khớp lại.

## 2. Chạy thử trên máy

Không mở trực tiếp file `index.html` (trình duyệt sẽ chặn đọc `data.json`). Chạy máy chủ tĩnh:

```bash
python3 -m http.server 8000
```

Mở http://localhost:8000. Ở chế độ này chatbot dùng FAQ. Để thử chế độ AI cần PHP: `php -S localhost:8000` cùng file `api/config.php`.

## 3. Đưa lên GitHub

```bash
git init -b main
git add .
git commit -m "Initial commit"
gh repo create CareerAssistantAI --public --source=. --push
```

(Hoặc tạo repo trống trên github.com rồi `git remote add origin ...` và `git push -u origin main`.)
Kiểm tra `git status` để chắc chắn `api/config.php` không bị theo dõi.

## 4. Deploy lên Hostinger (Git trong hPanel)

1. hPanel → **Websites** → chọn website → **Advanced → Git**.
2. Nhập URL repo (`https://github.com/<user>/CareerAssistantAI.git`), branch `main`, thư mục cài đặt để **trống** (= `public_html`). Repo private: thêm SSH deploy key hiển thị trong hPanel vào GitHub (*Settings → Deploy keys*).
3. Bấm **Create** rồi **Deploy**. Bật **Auto deployment** và dán Webhook URL vào GitHub (*Settings → Webhooks*, content type `application/json`) để mỗi lần push tự cập nhật.
4. Bật SSL (Let's Encrypt) trong hPanel → **Security → SSL**.

### Bật chatbot AI
1. Tạo API key tại console.anthropic.com.
2. hPanel → **File Manager** → `public_html/api/` → tạo file `config.php`, dán nội dung từ `config.sample.php` và điền `api_key`.
3. Mở website, mục Chatbot sẽ hiện "trợ lý AI đang hoạt động". Nên đặt hạn mức chi tiêu trong console để tránh bị lạm dụng; `chat.php` đã giới hạn 20 tin/10 phút/IP.

### Phương án khác: FTP qua GitHub Actions
Xem `.github/workflows/deploy.yml` (mặc định chỉ chạy thủ công). Không cần nếu đã dùng Git của hPanel.

## Bảo mật

- Không bao giờ đặt API key trong JS/HTML hoặc commit `api/config.php`.
- Nếu key từng bị commit, hãy thu hồi và tạo key mới.
