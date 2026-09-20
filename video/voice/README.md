# Thu giọng người thật cho video

Giọng máy khó tự nhiên như người thật. Nếu muốn dùng giọng của bạn (hoặc của một bạn trong nhóm):

1. Thu **từng câu** dưới đây thành từng file riêng (Voice Memos trên iPhone/Mac là đủ). Đọc tự nhiên, không cần vội vì video sẽ tự cắt khoảng lặng đầu và cuối mỗi file.
2. Đặt tên file theo số thứ tự: `01.m4a`, `02.m4a`, ... (cũng nhận `.wav`, `.mp3`, `.aac`) và bỏ vào thư mục `video/voice/`.
3. Chạy `ruby tools/build_video.rb`. Khi đủ file cho **mọi** câu, video tự dùng giọng của bạn (thời lượng sẽ theo tốc độ đọc của bạn); thiếu bất kỳ file nào thì vẫn dùng giọng máy.
4. Muốn quay lại giọng máy: chuyển các file ghi âm ra khỏi thư mục này.

File ghi âm không được đưa lên GitHub (đã nằm trong `.gitignore`); chỉ file `narration.m4a` được tạo ra sẽ lên web.

## Các câu cần đọc

**Cảnh: mo-dau**
- `01` CareerAssistantAI – trợ lý AI giúp học sinh chọn nghề.

**Cảnh: van-de**
- `02` Nhiều em còn phân vân vì chưa hiểu rõ năng lực và thiếu thông tin nghề nghiệp.

**Cảnh: khao-sat**
- `03` Khảo sát 1.252 học sinh: 38,8% đã xác định rõ định hướng, 40,5% dùng AI thường xuyên.

**Cảnh: so-lieu**
- `04` Số liệu trực quan, lọc theo khối và giới tính.

**Cảnh: holland**
- `05` Trắc nghiệm Holland 36 câu, chỉ 5 phút, cho bạn mã sở thích, gợi ý ngành và kết quả PDF.

**Cảnh: chatbot**
- `06` Trợ lý AI giải thích kết quả, nhưng chỉ để tham khảo.

**Cảnh: ket**
- `07` Hiểu mình, chọn đúng hướng.
- `08` Truy cập careerassistantai.online

Gợi ý cách đọc: **CareerAssistantAI** đọc là "Ca-ri-ơ A-xít-tần Ây Ai"; **careerassistantai.online** đọc là "careerassistantai chấm online".
