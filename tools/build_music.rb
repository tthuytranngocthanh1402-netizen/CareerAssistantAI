# encoding: utf-8
# Tạo nhạc nền gốc (không dính bản quyền) cho video giới thiệu: video/music.m4a
# và cập nhật video/timeline.json để dùng nhạc này làm âm thanh của video.
#
#   ruby tools/build_music.rb          (cần macOS: dùng `afconvert` để nén sang m4a; mất 1–3 phút)
#
# Nhạc được tổng hợp bằng code (không dùng mẫu âm thanh có sẵn): piano điện, dàn dây (pad), bass,
# trống nhẹ, hòa âm C – G – Am – F quen thuộc trong nhạc thuyết trình/doanh nghiệp. Bố cục bám theo
# 7 cảnh của video (mở đầu nhẹ, tăng dần, cao trào ở trắc nghiệm Holland, lắng lại ở chatbot,
# kết bằng hợp âm chủ). Nhịp độ được chọn để các điểm chuyển cảnh rơi vào đầu ô nhịp.
#
# Chỉnh phong cách: sửa mảng INTENSITY (độ dày nhạc từng cảnh, 0–4), TEMPO_RANGE và các biên độ AMP.
require 'json'
require 'tmpdir'
require 'fileutils'
Encoding.default_external = Encoding::UTF_8

ROOT = File.expand_path('..', __dir__)
SR = 32_000
INTENSITY = [0, 1, 2, 3, 3, 2, 4].freeze # theo thứ tự cảnh: mở đầu, vấn đề, khảo sát, số liệu, Holland, chatbot, kết
TEMPO_RANGE = (84..126)
AMP = { pad: 0.10, key: 0.10, melody: 0.13, bass: 0.20, kick: 0.55, hat: 0.05, clap: 0.15 }.freeze

tl_path = File.join(ROOT, 'video/timeline.json')
tl = JSON.parse(File.read(tl_path, encoding: 'UTF-8'))
D = tl['duration'].to_f
starts = tl['scenes'].map { |s| s['start'].to_f }
bounds = starts[1..-1] + [D]

# ---- Chọn số ô nhịp sao cho các ranh giới cảnh gần đầu ô nhịp nhất ----
best = nil
(20..40).each do |n|
  len = D / n
  next unless TEMPO_RANGE.cover?(240.0 / len)
  err = bounds.sum { |b| x = b / len; (x - x.round).abs }
  best = [n, err] if best.nil? || err < best[1]
end
abort 'Không chọn được nhịp độ phù hợp' unless best
BARS = best[0]
BAR = D / BARS
BEAT = BAR / 4.0
puts format('Nhịp độ: %.1f BPM, %d ô nhịp (mỗi ô %.2f giây)', 240.0 / BAR, BARS, BAR)

TOTAL = ((D + 0.1) * SR).to_i
TS = 2048
TAB = Array.new(TS + 1) { |i| (1..7).sum { |k| Math.sin(k * 2 * Math::PI * i / TS) / (k**1.3) } }
peak = TAB.map(&:abs).max
TAB.map! { |v| v / peak }

def mtof(m)
  440.0 * 2**((m - 69) / 12.0)
end

def smooth(x)
  x = 0.0 if x < 0
  x = 1.0 if x > 1
  x * x * (3 - 2 * x)
end

# ---- Bộ trộn: 'wet' (đi qua reverb) và 'dry' ----
WL = Array.new(TOTAL, 0.0)
WR = Array.new(TOTAL, 0.0)
DL = Array.new(TOTAL, 0.0)
DR = Array.new(TOTAL, 0.0)
RNG = Random.new(20_260_920)

def gains(pan)
  a = (pan + 1) * Math::PI / 4
  [Math.cos(a), Math.sin(a)]
end

# Pad ấm: 3 dao động lệch nhẹ, mở dần và tắt dần
def pad(midi, t0, t1, amp)
  attack = 0.9
  rel = 1.4
  f0 = mtof(midi)
  n0 = [(t0 * SR).to_i, 0].max
  n1 = [((t1 + rel) * SR).to_i, TOTAL - 1].min
  [[-0.0022, -0.7], [0.0, 0.0], [0.0022, 0.7]].each do |det, pan|
    inc = f0 * (1 + det) / SR
    ph = RNG.rand
    gl, gr = gains(pan)
    i = n0
    while i <= n1
      t = i.to_f / SR
      env = smooth((t - t0) / attack)
      env *= 1.0 - smooth((t - t1) / rel) if t > t1
      ph += inc
      ph -= 1.0 if ph >= 1.0
      pos = ph * TS
      k = pos.to_i
      s = TAB[k] + (TAB[k + 1] - TAB[k]) * (pos - k)
      v = s * env * amp
      WL[i] += v * gl
      WR[i] += v * gr
      i += 1
    end
  end
end

# Piano điện (FM): dùng cho arpeggio và giai điệu
def key(midi, t0, amp, pan, tau, bright)
  n0 = (t0 * SR).to_i
  return if n0 >= TOTAL
  n1 = [n0 + (tau * 6.5 * SR).to_i, TOTAL - 1].min
  w = 2 * Math::PI * mtof(midi) / SR
  dec = Math.exp(-1.0 / (tau * SR))
  idec = Math.exp(-1.0 / (0.22 * SR))
  env = 1.0
  idx = bright
  gl, gr = gains(pan)
  ph = 0.0
  i = n0
  while i <= n1
    att = (i - n0) < 96 ? (i - n0) / 96.0 : 1.0
    v = Math.sin(ph + idx * Math.sin(ph)) * env * att * amp
    WL[i] += v * gl
    WR[i] += v * gr
    ph += w
    env *= dec
    idx *= idec
    i += 1
  end
end

def bass(midi, t0, dur, amp)
  n0 = (t0 * SR).to_i
  n1 = [((t0 + dur + 0.2) * SR).to_i, TOTAL - 1].min
  w = 2 * Math::PI * mtof(midi) / SR
  ph = 0.0
  i = n0
  while i <= n1
    t = i.to_f / SR - t0
    env = smooth(t / 0.012) * Math.exp(-t / 1.4)
    env *= 1.0 - smooth((t - dur) / 0.2) if t > dur
    v = (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph)) * env * amp
    DL[i] += v
    DR[i] += v
    ph += w
    i += 1
  end
end

def kick(t0, amp)
  n0 = (t0 * SR).to_i
  ph = 0.0
  (0...(0.4 * SR).to_i).each do |k|
    i = n0 + k
    break if i >= TOTAL
    t = k.to_f / SR
    f = 48 + 110 * Math.exp(-t / 0.028)
    v = Math.sin(ph) * Math.exp(-t / 0.11) * amp
    DL[i] += v
    DR[i] += v
    ph += 2 * Math::PI * f / SR
  end
end

def hat(t0, amp, pan)
  n0 = (t0 * SR).to_i
  gl, gr = gains(pan)
  prev = 0.0
  (0...(0.09 * SR).to_i).each do |k|
    i = n0 + k
    break if i >= TOTAL
    nz = RNG.rand * 2 - 1
    v = (nz - prev) * Math.exp(-(k.to_f / SR) / 0.022) * amp
    prev = nz
    DL[i] += v * gl
    DR[i] += v * gr
  end
end

def clap(t0, amp)
  n0 = (t0 * SR).to_i
  lp = 0.0
  (0...(0.26 * SR).to_i).each do |k|
    i = n0 + k
    break if i >= TOTAL
    t = k.to_f / SR
    lp += 0.4 * ((RNG.rand * 2 - 1) - lp)
    v = (lp * 1.6 * Math.exp(-t / 0.07) + Math.sin(2 * Math::PI * 185 * t) * 0.35 * Math.exp(-t / 0.05)) * amp
    DL[i] += v
    DR[i] += v
    WL[i] += v * 0.35
    WR[i] += v * 0.35
  end
end

# Tiếng "vút" tăng dần trước khi vào đoạn dày hơn, và tiếng chũm chọe nhẹ ở đầu đoạn
def swell(t0, dur, amp)
  n0 = (t0 * SR).to_i
  prev = 0.0
  (0...(dur * SR).to_i).each do |k|
    i = n0 + k
    break if i >= TOTAL
    x = k.to_f / (dur * SR)
    nz = RNG.rand * 2 - 1
    v = (nz - prev) * x * x * amp
    prev = nz
    WL[i] += v
    WR[i] += v
  end
end

def crash(t0, amp)
  n0 = (t0 * SR).to_i
  prev = 0.0
  (0...(1.6 * SR).to_i).each do |k|
    i = n0 + k
    break if i >= TOTAL
    nz = RNG.rand * 2 - 1
    v = (nz - prev) * Math.exp(-(k.to_f / SR) / 0.45) * amp
    prev = nz
    WL[i] += v
    WR[i] += v
  end
end

# ---- Hòa âm và giai điệu ----
CHORDS = {
  'C' => { pad: [60, 64, 67], bass: 36, tones: [60, 64, 67, 72, 76, 79] },
  'G' => { pad: [59, 62, 67], bass: 43, tones: [59, 62, 67, 71, 74, 79] },
  'Am' => { pad: [57, 60, 64], bass: 45, tones: [57, 60, 64, 69, 72, 76] },
  'F' => { pad: [57, 60, 65], bass: 41, tones: [57, 60, 65, 69, 72, 77] }
}.freeze
CYCLE = %w[C G Am F].freeze
ENDING = %w[F G C C].freeze
MOTIF = {
  'C' => [[0, 76, 1.5], [1.5, 79, 0.5], [2, 79, 2]],
  'G' => [[0, 74, 1.5], [1.5, 71, 0.5], [2, 74, 2]],
  'Am' => [[0, 72, 1.5], [1.5, 76, 0.5], [2, 81, 2]],
  'F' => [[0, 77, 1.5], [1.5, 72, 0.5], [2, 69, 2]]
}.freeze
END_MOTIF = [
  [[0, 72, 2], [2, 69, 2]],
  [[0, 74, 2], [2, 71, 2]],
  [[0, 76, 2], [2, 79, 2]],
  [[0, 84, 4]]
].freeze
ARP = [0, 2, 4, 5, 4, 2, 3, 1].freeze

def intensity_at(t, starts)
  idx = starts.rindex { |s| s <= t + 0.05 } || 0
  INTENSITY[idx] || 2
end

prev_int = 0
BARS.times do |b|
  t0 = b * BAR
  last4 = b >= BARS - 4
  name = last4 ? ENDING[b - (BARS - 4)] : CYCLE[b % 4]
  ch = CHORDS[name]
  inten = last4 ? 4 : intensity_at(t0, starts)
  final = b == BARS - 1

  # Pad
  ch[:pad].each { |m| pad(m, t0 - 0.25, t0 + BAR, AMP[:pad] * (1 + 0.15 * inten)) }
  pad(ch[:pad][0] + 12, t0 - 0.25, t0 + BAR, AMP[:pad] * 0.5) if inten >= 3

  # Bass
  if inten >= 1
    if final
      bass(ch[:bass], t0, BAR * 0.95, AMP[:bass])
    else
      bass(ch[:bass], t0, BEAT * 1.4, AMP[:bass])
      bass(ch[:bass], t0 + 2 * BEAT, BEAT * 1.4, AMP[:bass] * 0.9)
      bass(ch[:bass] + 12, t0 + 3.5 * BEAT, BEAT * 0.4, AMP[:bass] * 0.55) if inten >= 3
    end
  end

  # Piano điện
  if final
    [60, 64, 67, 72].each_with_index { |m, k| key(m, t0 + k * 0.02, AMP[:key] * 0.9, (k - 1.5) / 4.0, 1.8, 1.2) }
  elsif inten == 0
    [0, 2, 4, 2].each_with_index do |ti, k|
      key(ch[:tones][ti], t0 + k * BEAT + RNG.rand * 0.006, AMP[:key] * 0.7, (ti - 2.5) / 6.0, 0.9, 1.0)
    end
  else
    ARP.each_with_index do |ti, k|
      accent = (k % 4 == 0 ? 1.15 : 0.9) * (0.92 + RNG.rand * 0.16)
      key(ch[:tones][ti], t0 + k * BEAT / 2.0 + RNG.rand * 0.006, AMP[:key] * accent, (ti - 2.5) / 6.0, 0.55, 1.3)
    end
  end

  # Giai điệu
  motif = if final then END_MOTIF[3]
          elsif last4 then END_MOTIF[b - (BARS - 4)]
          elsif inten >= 3 then MOTIF[name]
          end
  motif&.each do |beat, m, len|
    key(m, t0 + beat * BEAT, AMP[:melody], 0.15, 0.55 + len * 0.28, 1.7)
  end

  # Trống
  drums = inten >= 2 && !final
  if drums
    kick(t0, AMP[:kick])
    kick(t0 + 2 * BEAT, AMP[:kick] * 0.9)
    kick(t0 + 3.5 * BEAT, AMP[:kick] * 0.5) if inten >= 3 && b.odd?
    4.times { |k| hat(t0 + (k + 0.5) * BEAT, AMP[:hat] * (k.even? ? 1.0 : 0.75), k.even? ? -0.3 : 0.3) }
    if inten >= 3
      clap(t0 + BEAT, AMP[:clap])
      clap(t0 + 3 * BEAT, AMP[:clap])
    end
  end
  kick(t0, AMP[:kick] * 1.1) if final

  # Chuyển đoạn: chũm chọe ở đầu đoạn dày hơn, tiếng vút ở cuối ô nhịp trước đó
  if inten > prev_int
    crash(t0, 0.07)
    swell([t0 - BEAT * 2, 0].max, BEAT * 2, 0.05) if b > 0
  end
  crash(t0, 0.09) if final
  prev_int = inten
end

# ---- Reverb (Schroeder) ----
def schroeder(x, comb_delays, ap_delays)
  n = x.size
  y = Array.new(n, 0.0)
  comb_delays.each do |d|
    buf = Array.new(d, 0.0)
    idx = 0
    store = 0.0
    n.times do |i|
      o = buf[idx]
      store = o * 0.7 + store * 0.3
      buf[idx] = x[i] + store * 0.80
      idx += 1
      idx = 0 if idx == d
      y[i] += o
    end
  end
  ap_delays.each do |d|
    buf = Array.new(d, 0.0)
    idx = 0
    n.times do |i|
      v = buf[idx]
      w = y[i] + 0.5 * v
      y[i] = -0.5 * w + v
      buf[idx] = w
      idx += 1
      idx = 0 if idx == d
    end
  end
  y
end

puts 'Đang tạo hiệu ứng vang...'
rev_l = schroeder(WL, [810, 862, 927, 984], [403, 247])
rev_r = schroeder(WR, [833, 885, 950, 1007], [410, 253])

# ---- Trộn và xử lý tổng ----
mix_l = Array.new(TOTAL)
mix_r = Array.new(TOTAL)
TOTAL.times do |i|
  mix_l[i] = DL[i] + WL[i] * 0.85 + rev_l[i] * 0.16
  mix_r[i] = DR[i] + WR[i] * 0.85 + rev_r[i] * 0.16
end

# Fade vào/ra
fade_in = (1.2 * SR).to_i
fade_out = (3.0 * SR).to_i
TOTAL.times do |i|
  g = 1.0
  g *= smooth(i.to_f / fade_in) if i < fade_in
  rem = TOTAL - i
  g *= smooth(rem.to_f / fade_out) if rem < fade_out
  mix_l[i] *= g
  mix_r[i] *= g
end

# Chuẩn hóa độ to (RMS ~ -17 dBFS) rồi làm tròn đỉnh nhẹ để không vỡ tiếng
sq = 0.0
TOTAL.times { |i| sq += mix_l[i]**2 + mix_r[i]**2 }
rms = Math.sqrt(sq / (2 * TOTAL))
gain = 0.14 / rms
drive = 1.0
limit = ->(v) { Math.tanh(v * gain * drive) * 0.92 }

Dir.mktmpdir('music') do |tmp|
  wav = File.join(tmp, 'music.wav')
  data = +''.b
  chunk = 50_000
  peak_out = 0.0
  (0...TOTAL).step(chunk) do |s|
    e = [s + chunk, TOTAL].min
    frames = []
    (s...e).each do |i|
      l = limit.call(mix_l[i])
      r = limit.call(mix_r[i])
      peak_out = [peak_out, l.abs, r.abs].max
      frames << (l * 32_767).round << (r * 32_767).round
    end
    data << frames.pack('s<*')
  end
  header = ['RIFF', 36 + data.bytesize, 'WAVE', 'fmt ', 16, 1, 2, SR, SR * 4, 4, 16, 'data', data.bytesize].pack('a4Va4a4VvvVVvva4V')
  File.binwrite(wav, header + data)

  out = File.join(ROOT, 'video/music.m4a')
  FileUtils.rm_f(out)
  system('afconvert', '-f', 'm4af', '-d', 'aac', '-b', '128000', wav, out) or abort 'afconvert lỗi'

  # Thống kê năng lượng từng cảnh (kiểm tra bố cục: mở đầu nhẹ → cao trào → kết)
  puts format('Đỉnh sau xử lý: %.2f (không vượt 1.0, không bị vỡ tiếng)', peak_out)
  puts 'Độ to (RMS, dBFS) theo cảnh:'
  tl['scenes'].each_with_index do |sc, k|
    a = (sc['start'] * SR).to_i
    z = [(sc['end'] * SR).to_i, TOTAL].min
    s2 = 0.0
    (a...z).each { |i| v = limit.call(mix_l[i]); s2 += v * v }
    db = 10 * Math.log10(s2 / [z - a, 1].max + 1e-12)
    puts format('  %-9s intensity %d  %6.1f dB', sc['id'], INTENSITY[k] || 2, db)
  end
end

tl['audio'] = 'music.m4a'
tl['version'] = Time.now.to_i
File.write(tl_path, JSON.pretty_generate(tl) + "\n")
puts "OK: video/music.m4a (#{format('%.1f', D)} giây), timeline.json đã trỏ tới nhạc nền."
