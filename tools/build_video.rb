# encoding: utf-8
# Tạo giọng đọc cho video giới thiệu (video/narration.m4a) và bảng thời gian (video/timeline.json)
# từ video/script.json. Cần macOS (lệnh `say` với giọng "Linh" và `afconvert`).
#
#   ruby tools/build_video.rb
#
# Các câu được đọc riêng rồi ghép vào một file âm thanh duy nhất, nên thời điểm bắt đầu từng câu
# (dùng cho phụ đề và chuyển cảnh) là chính xác.
require 'json'
require 'tmpdir'
require 'fileutils'
Encoding.default_external = Encoding::UTF_8

ROOT = File.expand_path('..', __dir__)
script = JSON.parse(File.read(File.join(ROOT, 'video/script.json'), encoding: 'UTF-8'))
voice = script['voice'] || 'Linh'
RATE = 22_050
LEAD = 0.5          # im lặng đầu video
GAP_SENTENCE = 0.3 # nghỉ giữa các câu trong một cảnh
GAP_SCENE = 0.7     # nghỉ giữa các cảnh
TAIL = 2.0          # kéo dài cuối video

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
  ("\x00\x00".b) * (seconds * RATE).round
end

def write_wav(path, pcm)
  header = ['RIFF', 36 + pcm.bytesize, 'WAVE', 'fmt ', 16, 1, 1, RATE, RATE * 2, 2, 16, 'data', pcm.bytesize].pack('a4Va4a4VvvVVvva4V')
  File.binwrite(path, header + pcm)
end

pcm = silence(LEAD)
scenes = []
Dir.mktmpdir('video-audio') do |tmp|
  script['scenes'].each_with_index do |scene, si|
    sentences = []
    scene['sentences'].each_with_index do |s, i|
      wav = File.join(tmp, "s#{si}_#{i}.wav")
      system('say', '-v', voice, '-r', (script['rate'] || 175).to_s, "--data-format=LEI16@#{RATE}", '-o', wav, s['tts']) or abort "say lỗi ở câu: #{s['tts']}"
      fmt, body = read_wav_pcm(wav)
      abort "Định dạng WAV không như mong đợi: #{fmt.inspect}" unless fmt[0] == 1 && fmt[1] == 1 && fmt[2] == RATE && fmt[5] == 16
      start = pcm.bytesize / 2.0 / RATE
      pcm << body
      finish = pcm.bytesize / 2.0 / RATE
      sentences << { 'start' => start.round(3), 'end' => finish.round(3), 'text' => s['text'] }
      last_sentence = i == scene['sentences'].size - 1
      last_scene = si == script['scenes'].size - 1
      pcm << silence(last_sentence ? (last_scene ? TAIL : GAP_SCENE) : GAP_SENTENCE)
    end
    scenes << { 'id' => scene['id'], 'sentences' => sentences }
  end

  duration = (pcm.bytesize / 2.0 / RATE).round(3)
  # Ranh giới cảnh: 0,5 giây sau câu cuối của cảnh trước
  scenes.each_with_index do |sc, i|
    sc['start'] = i.zero? ? 0.0 : (scenes[i - 1]['sentences'].last['end'] + 0.4).round(3)
  end
  scenes.each_with_index { |sc, i| sc['end'] = i == scenes.size - 1 ? duration : scenes[i + 1]['start'] }

  full = File.join(tmp, 'narration.wav')
  write_wav(full, pcm)
  out = File.join(ROOT, 'video/narration.m4a')
  FileUtils.rm_f(out)
  system('afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', full, out) or abort 'afconvert lỗi'

  timeline = { 'audio' => 'narration.m4a', 'duration' => duration, 'scenes' => scenes }
  File.write(File.join(ROOT, 'video/timeline.json'), JSON.pretty_generate(timeline) + "\n")
  puts "OK: #{duration} giây, #{scenes.size} cảnh, #{scenes.sum { |s| s['sentences'].size }} câu"
  scenes.each { |s| puts format('  %-9s %6.2f – %6.2f (%.1fs)', s['id'], s['start'], s['end'], s['end'] - s['start']) }
end
