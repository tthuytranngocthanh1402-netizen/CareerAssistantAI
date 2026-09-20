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
