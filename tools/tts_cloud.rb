# encoding: utf-8
# Tạo giọng đọc "người thật" (kiểu podcast) bằng dịch vụ đọc văn bản trên đám mây, rồi ghép thành video.
#
#   ruby tools/tts_cloud.rb --provider openai          # cần OPENAI_API_KEY
#   ruby tools/tts_cloud.rb --provider azure           # cần AZURE_SPEECH_KEY (và AZURE_SPEECH_REGION)
#   ruby tools/tts_cloud.rb --provider google          # cần GOOGLE_TTS_API_KEY
#   ruby tools/tts_cloud.rb --provider elevenlabs      # cần ELEVENLABS_API_KEY và ELEVENLABS_VOICE_ID
#
# Tùy chọn: --voice TÊN_GIỌNG   --speed 1.0   --force (thay các file trong video/voice/)   --no-build
#
# Cách hoạt động: đọc từng câu trong video/script.json (ưu tiên trường "cloud", nếu thiếu dùng "text"),
# gửi tới dịch vụ, lưu thành video/voice/01.mp3, 02.mp3, ... rồi chạy tools/build_video.rb ở chế độ
# giọng người thật (tự cắt khoảng lặng, ghép thành narration.m4a và cập nhật timeline.json).
#
# API key chỉ đọc từ biến môi trường trong terminal của bạn (export ...), không ghi vào file nào.
# Nội dung gửi đi chỉ là các câu thuyết minh (đã công khai trên website), không có dữ liệu cá nhân.
require 'json'
require 'net/http'
require 'uri'
require 'base64'
require 'fileutils'
require 'tmpdir'
Encoding.default_external = Encoding::UTF_8

ROOT = File.expand_path('..', __dir__)
VOICE_DIR = File.join(ROOT, 'video/voice')

opts = { provider: nil, voice: nil, speed: 1.0, force: false, build: true }
args = ARGV.dup
until args.empty?
  a = args.shift
  case a
  when '--provider' then opts[:provider] = args.shift
  when '--voice' then opts[:voice] = args.shift
  when '--speed' then opts[:speed] = args.shift.to_f
  when '--force' then opts[:force] = true
  when '--no-build' then opts[:build] = false
  else abort "Tùy chọn không hợp lệ: #{a}"
  end
end
abort 'Thiếu --provider (openai | azure | google | elevenlabs). Xem hướng dẫn ở đầu file.' unless opts[:provider]

def need_env(name, hint)
  v = ENV[name].to_s.strip
  abort "Chưa có biến môi trường #{name}. #{hint}" if v.empty?
  v
end

def post(url, headers, body)
  uri = URI(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  http.open_timeout = 15
  http.read_timeout = 90
  req = Net::HTTP::Post.new(uri.request_uri, headers)
  req.body = body
  res = http.request(req)
  abort "Lỗi #{res.code} từ #{uri.host}: #{res.body.to_s.force_encoding('UTF-8')[0, 300]}" unless res.code.to_i.between?(200, 299)
  res.body
end

def xml_escape(s)
  s.gsub('&', '&amp;').gsub('<', '&lt;').gsub('>', '&gt;')
end

# Mỗi hàm nhận (văn bản, tùy chọn) và trả về [dữ liệu âm thanh, phần mở rộng file]
PROVIDERS = {
  'openai' => lambda do |text, o|
    key = need_env('OPENAI_API_KEY', 'Chạy: export OPENAI_API_KEY="..." (key lấy tại platform.openai.com)')
    payload = {
      model: ENV['OPENAI_TTS_MODEL'] || 'gpt-4o-mini-tts',
      voice: o[:voice] || 'ash',
      input: text,
      response_format: 'mp3',
      speed: o[:speed],
      instructions: 'Nói tiếng Việt như một người dẫn podcast nam: giọng trầm ấm, gần gũi, tự nhiên, nhịp điệu thong thả ' \
                    'và có nhấn nhá, ngắt nghỉ tự nhiên giữa các ý, hơi nhấn vào các con số. Không đọc như robot hay như bản tin.'
    }
    [post('https://api.openai.com/v1/audio/speech', { 'Authorization' => "Bearer #{key}", 'Content-Type' => 'application/json' }, JSON.generate(payload)), 'mp3']
  end,
  'azure' => lambda do |text, o|
    key = need_env('AZURE_SPEECH_KEY', 'Chạy: export AZURE_SPEECH_KEY="..." AZURE_SPEECH_REGION="southeastasia" (tạo tài nguyên Speech trên portal.azure.com)')
    region = ENV['AZURE_SPEECH_REGION'] || 'southeastasia'
    voice = o[:voice] || 'vi-VN-NamMinhNeural'
    rate = ((o[:speed] - 1.0) * 100).round
    ssml = "<speak version='1.0' xml:lang='vi-VN'><voice name='#{voice}'><prosody rate='#{rate >= 0 ? '+' : ''}#{rate}%'>#{xml_escape(text)}</prosody></voice></speak>"
    headers = { 'Ocp-Apim-Subscription-Key' => key, 'Content-Type' => 'application/ssml+xml',
                'X-Microsoft-OutputFormat' => 'audio-24khz-96kbitrate-mono-mp3', 'User-Agent' => 'careerassistantai-video' }
    [post("https://#{region}.tts.speech.microsoft.com/cognitiveservices/v1", headers, ssml), 'mp3']
  end,
  'google' => lambda do |text, o|
    key = need_env('GOOGLE_TTS_API_KEY', 'Chạy: export GOOGLE_TTS_API_KEY="..." (bật Cloud Text-to-Speech API trên console.cloud.google.com)')
    payload = {
      input: { text: text },
      voice: { languageCode: 'vi-VN', name: o[:voice] || 'vi-VN-Neural2-D' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: o[:speed] }
    }
    res = post('https://texttospeech.googleapis.com/v1/text:synthesize', { 'X-Goog-Api-Key' => key, 'Content-Type' => 'application/json' }, JSON.generate(payload))
    [Base64.decode64(JSON.parse(res)['audioContent'].to_s), 'mp3']
  end,
  'elevenlabs' => lambda do |text, o|
    key = need_env('ELEVENLABS_API_KEY', 'Chạy: export ELEVENLABS_API_KEY="..." ELEVENLABS_VOICE_ID="..." (chọn giọng nam tiếng Việt trong Voice Library)')
    voice = o[:voice] || need_env('ELEVENLABS_VOICE_ID', 'Hoặc dùng --voice ID_GIỌNG')
    payload = {
      text: text, model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: o[:speed] }
    }
    [post("https://api.elevenlabs.io/v1/text-to-speech/#{voice}?output_format=mp3_44100_128", { 'xi-api-key' => key, 'Content-Type' => 'application/json' }, JSON.generate(payload)), 'mp3']
  end,
  # Chỉ để thử đường ống ghép âm thanh trên máy (dùng giọng máy, không phải giọng người)
  'mock' => lambda do |text, _o|
    tmp = File.join(Dir.tmpdir, "mock_#{Process.pid}.aiff")
    system('say', '-v', 'Linh', '-o', tmp, text) or abort 'say lỗi'
    data = File.binread(tmp)
    File.delete(tmp)
    [data, 'aiff']
  end
}.freeze

provider = PROVIDERS[opts[:provider]] or abort "Nhà cung cấp không hợp lệ: #{opts[:provider]}"
script = JSON.parse(File.read(File.join(ROOT, 'video/script.json'), encoding: 'UTF-8'))
sentences = script['scenes'].flat_map { |sc| sc['sentences'] }

FileUtils.mkdir_p(VOICE_DIR)
existing = Dir.glob(File.join(VOICE_DIR, '[0-9][0-9].*'))
if !existing.empty? && !opts[:force]
  abort "Thư mục video/voice/ đã có #{existing.size} file ghi âm (có thể là giọng thật của bạn). Thêm --force nếu muốn thay bằng giọng từ dịch vụ."
end
existing.each { |p| File.delete(p) }

# Nếu gọi dịch vụ lỗi giữa chừng, xóa các file đã tải dở để lần chạy sau không bị chặn
written = []
finished = false
at_exit { written.each { |p| File.delete(p) if File.exist?(p) } unless finished }

chars = sentences.sum { |s| (s['cloud'] || s['text']).length }
puts "Gửi #{sentences.size} câu (#{chars} ký tự) tới #{opts[:provider]}..."
sentences.each_with_index do |s, i|
  text = s['cloud'] || s['text']
  audio, ext = provider.call(text, opts)
  path = File.join(VOICE_DIR, format('%02d.%s', i + 1, ext))
  File.binwrite(path, audio)
  written << path
  puts format('  %02d  %5.1f KB  %s', i + 1, audio.bytesize / 1024.0, text[0, 60])
end

finished = true
if opts[:build]
  puts 'Ghép thành video...'
  system('ruby', File.join(ROOT, 'tools/build_video.rb')) or abort 'build_video.rb lỗi'
else
  puts 'Xong. Chạy: ruby tools/build_video.rb'
end
