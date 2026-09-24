# encoding: utf-8
# Tổng hợp file khảo sát .xlsx thành data/survey.json (chỉ số liệu tổng hợp, KHÔNG chứa từng phiếu trả lời).
#
# Cách chạy (macOS có sẵn ruby và unzip):
#   ruby tools/build_survey.rb "/đường/dẫn/KHAOSAT.xlsx" data/survey.json
#
# Số liệu được tính sẵn cho mọi tổ hợp bộ lọc (khối 10/11/12/tất cả × nam/nữ/tất cả)
# để trang web chỉ cần hiển thị. Không đưa file .xlsx lên GitHub.
require 'json'
require 'date'
Encoding.default_external = Encoding::UTF_8

xlsx, out = ARGV
abort 'Usage: ruby tools/build_survey.rb <file.xlsx> <out.json>' unless xlsx && out

# ---------- Đọc xlsx (không cần thư viện ngoài) ----------
read = ->(entry) { `unzip -p "#{xlsx}" "#{entry}"`.force_encoding('UTF-8') }
unesc = lambda do |s|
  s.gsub('&amp;', '&').gsub('&lt;', '<').gsub('&gt;', '>').gsub('&quot;', '"').gsub('&apos;', "'")
   .gsub(/&#(\d+);/) { [$1.to_i].pack('U') }
end
strings = read.('xl/sharedStrings.xml').scan(%r{<si>(.*?)</si>}m).map do |m|
  unesc.(m[0].scan(%r{<t[^>]*>(.*?)</t>}m).map { |t| t[0] }.join)
end
col2n = ->(c) { c.chars.inject(0) { |a, ch| a * 26 + ch.ord - 64 } }
rows = []
read.('xl/worksheets/sheet1.xml').scan(%r{<row [^>]*?r="(\d+)"[^>]*?(?:/>|>(.*?)</row>)}m) do |_rn, body|
  next unless body
  row = {}
  body.scan(%r{<c ([^>]*?)(?:/>|>(.*?)</c>)}m) do |attrs, inner|
    ref = attrs[/r="([A-Z]+)\d+"/, 1]
    t = attrs[/t="(\w+)"/, 1]
    v = inner && inner[%r{<v>(.*?)</v>}m, 1]
    if t == 'inlineStr'
      v = unesc.(inner.scan(%r{<t[^>]*>(.*?)</t>}m).map { |x| x[0] }.join)
    elsif t == 's' && v
      v = strings[v.to_i]
    end
    row[col2n.(ref)] = v
  end
  rows << row
end
width = rows.map { |r| r.keys.max || 0 }.max
table = rows.map { |r| (1..width).map { |c| r[c] } }
header = table[0].map { |h| h.to_s.gsub(/\s+/, ' ').strip }
data = table[1..-1].reject { |r| r.compact.empty? }

# ---------- Tìm cột theo nội dung tiêu đề ----------
col = lambda do |re|
  i = header.index { |h| h =~ re }
  abort "Không tìm thấy cột: #{re}" unless i
  i
end
cols_of = ->(re) { header.each_index.select { |i| header[i] =~ re } }

C = {
  time: col.(/^Dấu thời gian/), gender: col.(/^2\. Giới tính/), grade: col.(/^4\. Khối học/),
  school: col.(/^3\. Trường học/),
  q6: col.(/^6\./), q7: col.(/^7\./), q8: col.(/^8\./), q10: col.(/^10\./),
  q11: col.(/^11\./), q12: col.(/^12\./), q13: col.(/^13\./), q14: col.(/^14\./), q15: col.(/^15\./),
  q16: col.(/^16\./), q17: col.(/^17\./), q18: col.(/^18\./), q19: col.(/^19\./), q20: col.(/^20\./),
  q21: col.(/^21\./), q23: col.(/^23\./), q24: col.(/^24\./), q25: col.(/^25\./), q26: col.(/^26\./),
  q41: col.(/^Theo bạn, một AI hỗ trợ định hướng/)
}.freeze
Q9 = cols_of.(/^9\./)
PROD = cols_of.(/Kết quả \d\]$/)
abort "Cần 13 cột câu 9 (có #{Q9.size}) và 3 cột kết quả (có #{PROD.size})" unless Q9.size == 13 && PROD.size == 3
Q9_LABELS = Q9.map { |i| header[i][/\[(.*)\]\s*$/, 1] }

# ---------- Định nghĩa đáp án ----------
Q7 = ['Đã xác định rõ', 'Có định hướng nhưng chưa chắc chắn', 'Đang tìm hiểu', 'Chưa xác định'].freeze
Q11_RAW = ['Sử dụng thường xuyên', 'Thỉnh thoảng sử dụng', 'Biết nhưng chưa bao giờ sử dụng', 'Chưa từng nghe tới'].freeze
Q11 = ['Thường xuyên (hàng ngày hoặc trên 3 lần/tuần)', 'Thỉnh thoảng (dưới 3 lần/tuần)', 'Biết nhưng chưa bao giờ dùng', 'Chưa từng nghe tới'].freeze
Q20 = %w[Có Chưa].freeze
GROUPS = ['Kinh tế – Kinh doanh', 'Y tế – Sức khỏe', 'Công nghệ thông tin – AI', 'Kỹ thuật – Công nghệ',
          'Khoa học tự nhiên – Môi trường – Nông nghiệp', 'Giáo dục', 'Du lịch – Dịch vụ – Logistics',
          'Truyền thông – Nghệ thuật – Thiết kế', 'Khoa học xã hội – Luật – Nhân văn', 'An ninh – Quốc phòng'].freeze
Q10 = ['Chưa biết mình có năng lực ở lĩnh vực nào', 'Có quá nhiều ngành nghề để lựa chọn', 'Thiếu thông tin về nghề nghiệp',
       'Gia đình hoặc người xung quanh có ảnh hưởng', 'Chưa hiểu rõ sở thích', 'Lo ngại về sự thay đổi của thị trường lao động/AI',
       'Chưa hiểu rõ tính cách của mình', 'Chưa có cơ hội trải nghiệm thực tế', 'Chưa xác định được điểm mạnh'].freeze
Q15 = ['Khám phá sở thích và năng lực bản thân', 'So sánh các ngành nghề', 'Tìm hiểu về ngành/nghề', 'Tìm hiểu cơ hội việc làm',
       'Tìm hiểu xu hướng thị trường lao động', 'Nhờ AI gợi ý nghề nghiệp phù hợp', 'Tìm hiểu tác động của AI đến nghề nghiệp',
       'Tìm hiểu yêu cầu của nghề', 'Chưa từng sử dụng AI'].freeze
Q19 = ['Giảm nhu cầu nhân lực ở một số công việc', 'Làm thay đổi cách thức làm việc', 'Thay thế một số nhiệm vụ trong công việc',
       'Làm thay đổi yêu cầu về kỹ năng', 'Tăng năng suất và hỗ trợ con người', 'Tôi chưa hiểu rõ AI sẽ ảnh hưởng như thế nào',
       'Tạo ra những nghề nghiệp mới'].freeze
Q26 = ['Khả năng thấu cảm và tương tác trực tiếp với con người', 'Tư duy sáng tạo và khả năng tạo ra ý tưởng mới',
       'Kỹ năng giải quyết vấn đề phức tạp và linh hoạt', 'Kỹ năng chuyên môn kết hợp với khả năng sử dụng AI',
       'Khả năng lãnh đạo và quản lý con người', 'Khả năng thích nghi và học hỏi liên tục'].freeze
Q41 = ['Phân tích xu hướng và triển vọng của nghề nghiệp trong tương lai', 'Phân tích sở thích, tính cách và năng lực của bản thân',
       'Đề xuất lộ trình học tập và phát triển kỹ năng', 'Đưa ra các bài kiểm tra/hoạt động giúp tôi hiểu bản thân hơn',
       'Cảnh báo những điểm cần cân nhắc khi lựa chọn nghề nghiệp', 'Đánh giá mức độ tác động của AI đến từng nghề nghiệp',
       'Giải đáp thắc mắc về nghề nghiệp và ngành học', 'So sánh ưu, nhược điểm giữa các ngành nghề',
       'Gợi ý nghề nghiệp phù hợp với đặc điểm cá nhân', 'Cung cấp thông tin về ngành học và nghề nghiệp'].freeze

# ---------- Hàm tính ----------
pct = ->(count, n) { n.zero? ? 0.0 : (1000.0 * count / n).round / 10.0 }
single = lambda do |rs, ci, opts, match = ->(cell, opt) { cell.to_s.strip == opt }|
  opts.map { |o| pct.(rs.count { |r| match.(r[ci], o) }, rs.size) }
end
multi = ->(rs, ci, opts) { opts.map { |o| pct.(rs.count { |r| r[ci].to_s.include?(o) }, rs.size) } }
dist5 = ->(rs, ci) { (1..5).map { |k| pct.(rs.count { |r| r[ci].to_s.strip == k.to_s }, rs.size) } }
top2 = ->(rs, ci) { pct.(rs.count { |r| %w[4 5].include?(r[ci].to_s.strip) }, rs.size) }

# ---------- Khoảng thời gian khảo sát ----------
days = data.map { |r| r[C[:time]].to_f }.select { |x| x > 0 }.map { |x| Date.new(1899, 12, 30) + x.to_i }
from, to = days.min, days.max

# ---------- Tính cho từng tổ hợp bộ lọc ----------
segments = {}
[nil, '10', '11', '12'].each do |g|
  [nil, 'Nam', 'Nữ'].each do |s|
    rs = data.select { |r| (g.nil? || r[C[:grade]] == "Khối #{g}") && (s.nil? || r[C[:gender]] == s) }
    key = "#{g || 'all'}_#{{ nil => 'all', 'Nam' => 'nam', 'Nữ' => 'nu' }[s]}"
    prod_top2 = PROD.map { |i| top2.(rs, i) }
    seg = {
      'n' => rs.size,
      'grade' => %w[10 11 12].map { |k| pct.(rs.count { |r| r[C[:grade]] == "Khối #{k}" }, rs.size) },
      'gender' => %w[Nam Nữ].map { |k| pct.(rs.count { |r| r[C[:gender]] == k }, rs.size) },
      'kpis' => [rs.size, single.(rs, C[:q7], Q7)[0], single.(rs, C[:q11], Q11_RAW, ->(c, o) { c.to_s.start_with?(o) })[0],
                 (prod_top2.sum / 3.0).round(1)],
      'q6' => dist5.(rs, C[:q6]),
      'q7' => single.(rs, C[:q7], Q7),
      'q9' => Q9.map { |i| top2.(rs, i) },
      'q10' => multi.(rs, C[:q10], Q10),
      'q11' => single.(rs, C[:q11], Q11_RAW, ->(c, o) { c.to_s.start_with?(o) }),
      'q12_14' => [C[:q12], C[:q13], C[:q14]].map { |i| top2.(rs, i) },
      'q15' => multi.(rs, C[:q15], Q15),
      'q16' => dist5.(rs, C[:q16]),
      'q17_25' => [C[:q17], C[:q18], C[:q23], C[:q24], C[:q25]].map { |i| top2.(rs, i) },
      'q19' => multi.(rs, C[:q19], Q19),
      'q20' => single.(rs, C[:q20], Q20),
      'q26' => multi.(rs, C[:q26], Q26),
      'q8_21' => [multi.(rs, C[:q8], GROUPS), multi.(rs, C[:q21], GROUPS)],
      'prod' => prod_top2,
      'q41' => multi.(rs, C[:q41], Q41)
    }
    segments[key] = seg
  end
end

# ---------- Định nghĩa hiển thị ----------
kpis = [
  { 'label' => 'Học sinh THPT tham gia khảo sát', 'suffix' => '', 'decimals' => 0 },
  { 'label' => 'Đã xác định rõ định hướng nghề nghiệp', 'suffix' => '%', 'decimals' => 1 },
  { 'label' => 'Sử dụng AI thường xuyên (hàng ngày hoặc trên 3 lần/tuần)', 'suffix' => '%', 'decimals' => 1 },
  { 'label' => 'Quan tâm đến các sản phẩm của đề tài (mức 4–5)', 'suffix' => '%', 'decimals' => 1 }
]
likert_note = 'thang 1–5, tỷ lệ chọn mức 4–5'
sections = [
  { 'id' => 'dinh-huong', 'title' => 'Định hướng nghề nghiệp',
    'subtitle' => 'Học sinh hiểu bản thân đến đâu và đang ở giai đoạn nào của việc chọn nghề.',
    'charts' => [
      { 'id' => 'q7', 'type' => 'strip', 'title' => 'Học sinh đã có định hướng nghề nghiệp chưa?', 'caption' => 'Câu 7 · % học sinh', 'options' => Q7 },
      { 'id' => 'info', 'type' => 'info' },
      { 'id' => 'q6', 'type' => 'dist', 'title' => 'Mức độ hiểu rõ bản thân khi chọn nghề', 'caption' => 'Câu 6 · % học sinh theo mức 1–5 (1: thấp nhất, 5: cao nhất)', 'labels' => %w[1 2 3 4 5] },
      { 'id' => 'q9', 'type' => 'hbars', 'title' => 'Yếu tố ảnh hưởng đến định hướng nghề nghiệp', 'caption' => "Câu 9 · #{likert_note}", 'options' => Q9_LABELS, 'suffix' => '%' },
      { 'id' => 'q10', 'type' => 'hbars', 'title' => 'Vì sao học sinh chưa hiểu rõ bản thân, còn phân vân?', 'caption' => 'Câu 10 · chọn nhiều đáp án, % học sinh', 'options' => Q10, 'suffix' => '%', 'wide' => true }
    ] },
  { 'id' => 'dung-ai', 'title' => 'Học sinh sử dụng AI',
    'subtitle' => 'Mức độ quen thuộc và mục đích dùng AI trong học tập và định hướng nghề nghiệp.',
    'charts' => [
      { 'id' => 'q11', 'type' => 'strip', 'title' => 'Mức độ sử dụng công cụ AI', 'caption' => 'Câu 11 · % học sinh', 'options' => Q11 },
      { 'id' => 'q12_14', 'type' => 'meters', 'title' => 'Học sinh dùng AI để làm gì?', 'caption' => "Câu 12–14 · #{likert_note}", 'scoreLabel' => 'trung bình ba nội dung',
        'options' => ['Dùng AI vào học tập hằng ngày', 'Tìm hiểu về sự phát triển của AI', 'Dùng AI để tìm hiểu, định hướng nghề nghiệp'] },
      { 'id' => 'q15', 'type' => 'hbars', 'title' => 'Mục đích dùng AI để hỗ trợ định hướng nghề nghiệp', 'caption' => 'Câu 15 · chọn nhiều đáp án, % học sinh', 'options' => Q15, 'suffix' => '%', 'wide' => true,
        'note' => 'Lưu ý: mục “Chưa từng sử dụng AI” có thể trùng với các lựa chọn khác vì học sinh được chọn nhiều đáp án; số liệu được giữ nguyên như dữ liệu thu thập.' }
    ] },
  { 'id' => 'nhan-thuc', 'title' => 'Nhận thức về tác động của AI',
    'subtitle' => 'Học sinh nghĩ AI hỗ trợ và thay đổi nghề nghiệp, thị trường lao động như thế nào.',
    'charts' => [
      { 'id' => 'q16', 'type' => 'dist', 'title' => 'AI hỗ trợ học sinh định hướng nghề nghiệp ở mức nào?', 'caption' => 'Câu 16 · % học sinh theo mức 1–5',
        'labels' => ['Không hỗ trợ', 'Hỗ trợ ít', 'Bình thường', 'Khá nhiều', 'Rất nhiều'] },
      { 'id' => 'q17_25', 'type' => 'meters', 'title' => 'Nhận định về AI và nghề nghiệp', 'caption' => "Câu 17, 18, 23, 24, 25 · #{likert_note}", 'scoreLabel' => 'trung bình năm nhận định',
        'options' => ['AI thay đổi cách con người làm việc', 'AI tác động đến thị trường lao động', 'AI ảnh hưởng đến ngành nghề dự định chọn',
                      'Lo lắng khi nghề mong muốn bị AI thay thế', 'Cân nhắc đổi nghề nếu nghề bị AI thay thế'] },
      { 'id' => 'q19', 'type' => 'hbars', 'title' => 'AI có thể ảnh hưởng đến nghề nghiệp theo cách nào?', 'caption' => 'Câu 19 · chọn nhiều đáp án, % học sinh', 'options' => Q19, 'suffix' => '%' },
      { 'id' => 'q26', 'type' => 'hbars', 'title' => 'Yếu tố giúp công việc thích ứng tốt với AI', 'caption' => 'Câu 26 · chọn nhiều đáp án, % học sinh', 'options' => Q26, 'suffix' => '%' },
      { 'id' => 'q20', 'type' => 'strip', 'title' => 'Đã tìm hiểu ngành nghề chịu tác động của AI chưa?', 'caption' => 'Câu 20 · % học sinh', 'options' => Q20, 'wide' => true },
      { 'id' => 'q8_21', 'type' => 'trend', 'title' => 'Nhóm ngành quan tâm và nhóm ngành được cho là bị AI tác động', 'caption' => 'Câu 8 và 21 · chọn nhiều đáp án, % học sinh · rê chuột hoặc chạm để xem từng nhóm ngành',
        'options' => GROUPS, 'series' => ['Quan tâm (câu 8)', 'Bị AI tác động (câu 21)'], 'suffix' => '%', 'wide' => true }
    ] },
  { 'id' => 'san-pham', 'title' => 'Nhu cầu với sản phẩm của đề tài',
    'subtitle' => 'Mức quan tâm đến các kết quả của đề tài và tính năng học sinh mong muốn ở một AI hướng nghiệp.',
    'charts' => [
      { 'id' => 'prod', 'type' => 'meters', 'title' => 'Mức quan tâm đến từng sản phẩm của đề tài', 'caption' => "Kết quả 1–3 · #{likert_note}", 'scoreLabel' => 'quan tâm trung bình',
        'options' => ['Kết quả 1', 'Kết quả 2', 'Kết quả 3'] },
      { 'id' => 'q41', 'type' => 'hbars', 'title' => 'Tính năng học sinh mong muốn ở AI hướng nghiệp', 'caption' => 'Chọn nhiều đáp án, % học sinh', 'options' => Q41, 'suffix' => '%' }
    ] }
]

n = data.size
schools = data.map { |r| r[C[:school]] }.uniq.size
result = {
  'meta' => {
    'n' => n, 'schools' => schools,
    'period' => "#{from.strftime('%d/%m/%Y')} – #{to.strftime('%d/%m/%Y')}",
    'source' => 'Khảo sát học sinh THPT khối 10–12'
  },
  'kpis' => kpis,
  'sections' => sections
}

File.open(out, 'w:UTF-8') do |f|
  head = JSON.pretty_generate(result)
  f.write(head.sub(/\}\s*\z/, ",\n  \"seg\": {\n"))
  f.write(segments.map { |k, v| "    #{k.to_json}: #{v.to_json}" }.join(",\n"))
  f.write("\n  }\n}\n")
end
JSON.parse(File.read(out)) # kiểm tra JSON hợp lệ
puts "OK: #{out} (n=#{n}, #{schools} trường, #{segments.size} tổ hợp lọc, #{from}..#{to})"
