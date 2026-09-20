<?php
/**
 * Sao chép file này thành api/config.php (cùng thư mục) rồi điền API key.
 * config.php đã nằm trong .gitignore – KHÔNG commit lên GitHub.
 * Trên Hostinger: tạo config.php bằng File Manager của hPanel.
 */
return [
    // Lấy tại https://console.anthropic.com/
    'api_key' => 'DAN_API_KEY_CUA_BAN_VAO_DAY',

    'model' => 'claude-haiku-4-5-20251001',
    'max_tokens' => 500,

    // Giới hạn: tối đa 20 tin nhắn / 10 phút cho mỗi địa chỉ IP
    'rate_limit_requests' => 20,
    'rate_limit_window' => 600,

    // Hãy cập nhật cho khớp với nội dung thật của đề tài
    'system_prompt' => <<<'PROMPT'
Bạn là trợ lý của đề tài nghiên cứu khoa học "CareerAssistantAI" – trợ lý AI hỗ trợ sinh viên định hướng nghề nghiệp.
Nhiệm vụ: trả lời ngắn gọn, thân thiện, bằng tiếng Việt về mục tiêu đề tài, tính năng sản phẩm (tư vấn hội thoại, lộ trình kỹ năng, phản hồi CV, mô phỏng phỏng vấn), kết quả khảo sát và cách sử dụng. Bạn cũng có thể đưa ra gợi ý hướng nghiệp chung cho sinh viên.
Quy tắc:
- Không bịa số liệu. Nếu không chắc chắn hoặc không có thông tin, hãy nói rõ và gợi ý liên hệ nhóm nghiên cứu.
- Nhấn mạnh rằng AI hỗ trợ tham khảo, không thay thế cố vấn hướng nghiệp con người.
- Không yêu cầu người dùng cung cấp thông tin cá nhân nhạy cảm.
- Từ chối lịch sự các câu hỏi không liên quan đến đề tài hoặc hướng nghiệp.
- Trả lời tối đa khoảng 150 từ.
PROMPT,
];
