package app.gocast.encoder

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Float32Array
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow

/**
 * PCM → AAC-LC in ADTS frames, using the platform encoder.
 *
 * Harbor's webcast input takes any stream its decoders can sniff, and a raw
 * ADTS stream is self-describing: every frame carries its own header, so the
 * first byte harbor reads is already decodable and a frame lost to a reconnect
 * costs 23ms of audio, not the stream. That is why this does not emit an MP4
 * container or rely on the codec-config (ASC) blob MediaCodec produces first.
 *
 * AAC rather than MP3 (what the web studio sends) because Android ships a
 * hardware-backed AAC encoder and no MP3 one, and lamejs under Hermes, which
 * has no JIT, cannot keep up with real time on a phone.
 *
 * Synchronous on purpose: one call encodes ~100ms of audio in a few
 * milliseconds, and JS already owns the ordering (mix tap → encode → socket
 * send), so an async hop would only add reordering risk.
 *
 * The master limiter lives here too, as the last stage before the encoder,
 * because react-native-audio-api has no DynamicsCompressorNode. It copies the
 * web studio's limiter (client/lib/audioEngine.ts): threshold −2 dB, ratio 20,
 * hard knee, 1 ms attack, 100 ms release, and the same automatic makeup gain
 * the Web Audio compressor adds, so a mix leaves at the loudness it does from
 * the browser.
 */
class GocastEncoderModule : Module() {
  private var codec: MediaCodec? = null
  private var sampleRate = 44100
  private var channels = 1
  private var framesQueued = 0L
  private val info = MediaCodec.BufferInfo()

  private val thresholdDb = -2f
  private val ratio = 20f
  // Web Audio's compressor makeup: (1 / gain at 0 dBFS)^0.6, in dB.
  private val makeupDb = 0.6f * -(thresholdDb + (0f - thresholdDb) / ratio)
  private var attackCoef = 0f
  private var releaseCoef = 0f
  private var reductionDb = 0f

  override fun definition() = ModuleDefinition {
    Name("GocastEncoder")

    Function("start") { rate: Int, channelCount: Int, bitrate: Int ->
      release()
      if (sampleRateIndex(rate) < 0) {
        throw CodedException("ERR_SAMPLE_RATE", "AAC has no ADTS index for $rate Hz", null)
      }
      sampleRate = rate
      channels = channelCount
      framesQueued = 0
      attackCoef = exp(-1.0 / (0.001 * rate)).toFloat()
      releaseCoef = exp(-1.0 / (0.1 * rate)).toFloat()
      reductionDb = 0f

      val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, channelCount).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 64 * 1024)
      }
      codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
        configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        start()
      }
    }

    // One Float32Array per channel (left, then right when stereo), samples in
    // [-1, 1]. Returns zero or more ADTS frames.
    Function("encode") { left: Float32Array, right: Float32Array? ->
      val c = codec ?: throw CodedException("ERR_NOT_STARTED", "Encoder not started", null)
      val l = left.toDirectBuffer().order(ByteOrder.nativeOrder()).asFloatBuffer()
      val r = right?.toDirectBuffer()?.order(ByteOrder.nativeOrder())?.asFloatBuffer()
      val frames = l.remaining()
      val bytes = ByteBuffer.allocate(frames * channels * 2).order(ByteOrder.LITTLE_ENDIAN)
      for (i in 0 until frames) {
        val a = l.get(i)
        val b = if (channels == 2) (r?.get(i) ?: a) else a
        val gain = limiterGain(max(abs(a), abs(b)))
        bytes.putShort(toPcm16(a * gain))
        if (channels == 2) bytes.putShort(toPcm16(b * gain))
      }
      bytes.flip()

      val out = ByteArrayOutputStream()
      while (bytes.hasRemaining()) {
        val index = c.dequeueInputBuffer(10_000)
        if (index < 0) {
          // Every input buffer is still held: drain output to free one.
          drain(c, out)
          continue
        }
        val input = c.getInputBuffer(index)!!
        input.clear()
        val n = minOf(input.remaining(), bytes.remaining())
        val slice = bytes.slice()
        slice.limit(n)
        input.put(slice)
        bytes.position(bytes.position() + n)
        val ptsUs = framesQueued * 1_000_000L / sampleRate
        framesQueued += n / (2 * channels)
        c.queueInputBuffer(index, 0, n, ptsUs, 0)
        drain(c, out)
      }
      out.toByteArray()
    }

    Function("stop") {
      release()
    }

    OnDestroy {
      release()
    }
  }

  private fun drain(c: MediaCodec, out: ByteArrayOutputStream) {
    while (true) {
      val index = c.dequeueOutputBuffer(info, 0)
      if (index < 0) return
      val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
      if (!isConfig && info.size > 0) {
        val buffer = c.getOutputBuffer(index)!!
        buffer.position(info.offset)
        buffer.limit(info.offset + info.size)
        out.write(adtsHeader(info.size))
        val frame = ByteArray(info.size)
        buffer.get(frame)
        out.write(frame)
      }
      c.releaseOutputBuffer(index, false)
    }
  }

  /** Stereo-linked peak limiter; returns the gain for this frame. */
  private fun limiterGain(peak: Float): Float {
    val levelDb = if (peak > 1e-6f) 20f * log10(peak) else -120f
    val over = levelDb - thresholdDb
    val target = if (over > 0f) over * (1f - 1f / ratio) else 0f
    val coef = if (target > reductionDb) attackCoef else releaseCoef
    reductionDb = coef * reductionDb + (1f - coef) * target
    return 10f.pow((makeupDb - reductionDb) / 20f)
  }

  private fun toPcm16(sample: Float): Short {
    val s = sample.coerceIn(-1f, 1f)
    return (if (s < 0) s * 0x8000 else s * 0x7fff).toInt().toShort()
  }

  private fun adtsHeader(payload: Int): ByteArray {
    val length = payload + 7
    val profile = 2 // AAC LC
    val freq = sampleRateIndex(sampleRate)
    return byteArrayOf(
      0xFF.toByte(),
      0xF1.toByte(), // MPEG-4, no CRC
      (((profile - 1) shl 6) or (freq shl 2) or (channels shr 2)).toByte(),
      (((channels and 3) shl 6) or (length shr 11)).toByte(),
      ((length and 0x7FF) shr 3).toByte(),
      (((length and 7) shl 5) or 0x1F).toByte(),
      0xFC.toByte(),
    )
  }

  private fun sampleRateIndex(rate: Int): Int =
    intArrayOf(96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350)
      .indexOf(rate)

  private fun release() {
    codec?.let {
      try { it.stop() } catch (_: IllegalStateException) { }
      it.release()
    }
    codec = null
  }
}
