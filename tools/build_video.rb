# encoding: utf-8
# Tạo giọng đọc cho video giới thiệu (video/narration.m4a) và bảng thời gian (video/timeline.json)
# từ video/script.json. Cần macOS (lệnh `say` với giọng "Linh" và `afconvert`).
#
#   ruby tools/build_video.rb
#
# macOS chỉ có một giọng tiếng Việt (Linh, giọng nữ). Để có giọng nam, script hạ cao độ (`pitch_base`)
# rồi khai báo tần số lấy mẫu thấp hơn (`shift` < 1) để hạ cả âm sắc; tốc độ đọc thực tế là
# `say_rate * shift`. Các câu được đọc riêng rồi ghép thành một file duy nhất nên thời điểm bắt đầu từng
# câu (dùng cho phụ đề và chuyển cảnh) là chính xác.
#
# Các thông số (trong video/script.json, mục "voice_settings"):
#   say_rate        tốc độ của `say` trước khi hạ giọng (mặc định 215)
#   pitch_base      cao độ nền của `say` (thấp nhất khoảng 30–35; 37 cho giọng nam tự nhiên)
#   shift           hệ số hạ giọng 0.8–1.0; nhỏ hơn = trầm hơn và chậm hơn (mặc định 0.88)
#   comma_pause_ms  quãng nghỉ thêm sau dấu phẩy (mặc định 200)
#   lead, gap_sentence, gap_scene, tail   quãng lặng (giây) đầu video / giữa câu / giữa cảnh / cuối video
require 'json'
require 'tmpdir'
require 'fileutils'
Encoding.default_external = Encoding::UTF_8

ROOT = File.expand_path('..', __dir__)
script = JSON.parse(File.read(File.join(ROOT, 'video/script.json'), encoding: 'UTF-8'))
cfg = {
  'say_rate' => 215, 'pitch_base' => 37, 'shift' => 0.88, 'comma_pause_ms' => 200,
  'lead' => 0.8, 'gap_sentence' => 0.5, 'gap_scene' => 1.0, 'tail' => 2.8
}.merge(script['voice_settings'] || {})
voice = script['voice'] || 'Linh'
SRC_RATE = 22_050
EFF_RATE = (SRC_RATE * cfg['shift']).round # tần số lấy mẫu khai báo => giọng trầm hơn

def read_wav_pcm(path)
  data = File.binread(path)
  abort "Không phải file WAV: #{path}" unless data[0, 4] == 'RIFF' && data[8, 4] == 'WAVE'
  pos = 12
  fmt = nil
  while pos + 8 <= data.bytesize
    id = data[pos, 4]
    size = data[pos + 4, 4].unpack1('V')
    body = data[pos + 8, size]
    fmt = body.unpack('vvVVvv') if id == 'fmt '
    return [fmt, body] if id == 'data'
    pos += 8 + size + (size.odd? ? 1 : 0)
  end
  abort "Không tìm thấy dữ liệu âm thanh: #{path}"
end

def silence(seconds)
  ("\x00\x00".b) * (seconds * EFF_RATE).round
end

def write_wav(path, pcm)
  header = ['RIFF', 36 + pcm.bytesize, 'WAVE', 'fmt ', 16, 1, 1, EFF_RATE, EFF_RATE * 2, 2, 16, 'data', pcm.bytesize].pack('a4Va4a4VvvVVvva4V')
  File.binwrite(path, header + pcm)
end

def seconds(pcm)
  pcm.bytesize / 2.0 / EFF_RATE
end

def speech_text(tts, cfg)
  text = tts.gsub(/,\s+/, ", [[slnc #{cfg['comma_pause_ms']}]] ")
  "[[pbas #{cfg['pitch_base']}]] #{text}"
end

pcm = silence(cfg['lead'])
scenes = []
Dir.mktmpdir('video-audio') do |tmp|
  script['scenes'].each_with_index do |scene, si|
    sentences = []
    scene['sentences'].each_with_index do |s, i|
      wav = File.join(tmp, "s#{si}_#{i}.wav")
      system('say', '-v', voice, '-r', cfg['say_rate'].to_s, "--data-format=LEI16@#{SRC_RATE}", '-o', wav, speech_text(s['tts'], cfg)) or abort "say lỗi ở câu: #{s['tts']}"
      fmt, body = read_wav_pcm(wav)
      abort "Định dạng WAV không như mong đợi: #{fmt.inspect}" unless fmt[0] == 1 && fmt[1] == 1 && fmt[2] == SRC_RATE && fmt[5] == 16
      start = seconds(pcm)
      pcm << body
      finish = seconds(pcm)
      sentences << { 'start' => start.round(3), 'end' => finish.round(3), 'text' => s['text'] }
      last_sentence = i == scene['sentences'].size - 1
      last_scene = si == script['scenes'].size - 1
      pcm << silence(last_sentence ? (last_scene ? cfg['tail'] : cfg['gap_scene']) : cfg['gap_sentence'])
    end
    scenes << { 'id' => scene['id'], 'sentences' => sentences }
  end

  duration = seconds(pcm).round(3)
  # Ranh giới cảnh: 0,5 giây sau câu cuối của cảnh trước
  scenes.each_with_index do |sc, i|
    sc['start'] = i.zero? ? 0.0 : (scenes[i - 1]['sentences'].last['end'] + 0.5).round(3)
  end
  scenes.each_with_index { |sc, i| sc['end'] = i == scenes.size - 1 ? duration : scenes[i + 1]['start'] }

  full = File.join(tmp, 'narration.wav')
  write_wav(full, pcm)
  out = File.join(ROOT, 'video/narration.m4a')
  FileUtils.rm_f(out)
  system('afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', full, out) or abort 'afconvert lỗi'

  timeline = { 'audio' => 'narration.m4a', 'version' => Time.now.to_i, 'duration' => duration, 'scenes' => scenes }
  File.write(File.join(ROOT, 'video/timeline.json'), JSON.pretty_generate(timeline) + "\n")
  puts "OK: #{duration} giây, #{scenes.size} cảnh, #{scenes.sum { |s| s['sentences'].size }} câu (shift #{cfg['shift']}, tần số #{EFF_RATE} Hz)"
  scenes.each { |s| puts format('  %-9s %6.2f – %6.2f (%.1fs)', s['id'], s['start'], s['end'], s['end'] - s['start']) }
end
