<template>
  <div class="audio-recorder">
    <!-- idle -->
    <div v-if="state === 'idle'" class="ar-row">
      <button
        type="button"
        class="ar-btn ar-btn-primary"
        :disabled="isEditing"
        @click="startRecording"
      >
        🎙️ Grabar audio
      </button>
      <span class="ar-hint">máx. {{ maxMinutesLabel }}</span>
    </div>

    <!-- recording -->
    <div v-else-if="state === 'recording'" class="ar-col">
      <canvas ref="waveformCanvas" class="ar-canvas" width="280" height="48"></canvas>
      <div class="ar-row">
        <button type="button" class="ar-btn ar-btn-danger" @click="stopRecording">
          ⏹️ Detener
        </button>
        <span class="ar-timer">{{ elapsedLabel }}</span>
      </div>
    </div>

    <!-- preview -->
    <div v-else-if="state === 'preview'" class="ar-col">
      <!-- Reproductor custom: el <audio> nativo no puede mostrar la duración de los blobs
           WebM de MediaRecorder (duration=Infinity, seekable=0). Usamos la duración que
           medimos al grabar (recordedDuration) para el total. -->
      <div v-if="previewUrl" class="ar-player">
        <button
          type="button"
          class="ar-play-btn"
          @click="togglePlay"
          :aria-label="isPlaying ? 'Pausar' : 'Reproducir'"
        >
          {{ isPlaying ? "⏸" : "▶" }}
        </button>
        <div class="ar-progress">
          <div class="ar-progress-fill" :style="{ width: progressPct + '%' }"></div>
        </div>
        <span class="ar-time">{{ currentLabel }} / {{ totalLabel }}</span>
      </div>
      <audio
        v-if="previewUrl"
        ref="previewAudio"
        :src="previewUrl"
        preload="metadata"
        class="ar-audio-hidden"
        @timeupdate="onTimeUpdate"
        @play="onPlay"
        @pause="onPause"
        @ended="onEnded"
      ></audio>
      <div class="ar-row">
        <button type="button" class="ar-btn" @click="discardRecording">
          Volver a grabar
        </button>
        <button
          type="button"
          class="ar-btn ar-btn-primary"
          :disabled="!hasAudio"
          @click="saveRecording"
        >
          Guardar grabación
        </button>
      </div>
    </div>

    <!-- error -->
    <div v-else-if="state === 'error'" class="ar-col">
      <p class="ar-error">{{ errorMessage }}</p>
      <button type="button" class="ar-btn" @click="reset">Reintentar</button>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    uid: { type: String, required: true },
    content: { type: Object, required: true },
    /* wwEditor:start */
    wwEditorState: { type: Object, required: true },
    /* wwEditor:end */
  },
  emits: ["trigger-event"],
  data() {
    return {
      state: "idle",
      elapsed: 0,
      errorMessage: "",
      previewUrl: null,
      recordedFile: null,
      _mediaRecorder: null,
      _stream: null,
      _chunks: [],
      _timerId: null,
      _startTs: 0,
      _mimeType: "",
      _audioContext: null,
      _analyser: null,
      _freqData: null,
      _animFrameId: null,
      _waveformSamples: [],
      _lastSampleTime: 0,
      recordedDuration: 0,
      isPlaying: false,
      currentTime: 0,
      _progressRafId: null,
    };
  },
  computed: {
    isEditing() {
      /* wwEditor:start */
      return this.wwEditorState.isEditing;
      /* wwEditor:end */
      // eslint-disable-next-line no-unreachable
      return false;
    },
    maxDurationSeconds() {
      const v = Number(this.content?.maxDurationSeconds);
      return Number.isFinite(v) && v > 0 ? v : 240;
    },
    maxMinutesLabel() {
      const m = Math.floor(this.maxDurationSeconds / 60);
      const s = this.maxDurationSeconds % 60;
      return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")} min`;
    },
    elapsedLabel() {
      const m = Math.floor(this.elapsed / 60);
      const s = this.elapsed % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },
    hasAudio() {
      return !!this.recordedFile && this.recordedFile.size > 0;
    },
    currentLabel() {
      return this.fmtTime(this.currentTime);
    },
    totalLabel() {
      return this.fmtTime(this.recordedDuration);
    },
    progressPct() {
      if (!(this.recordedDuration > 0)) return 0;
      return Math.min(100, (this.currentTime / this.recordedDuration) * 100);
    },
  },
  methods: {
    getWin() {
      return wwLib.getFrontWindow();
    },
    pickMimeType(win) {
      const MR = win?.MediaRecorder;
      if (!MR || !MR.isTypeSupported) return "";
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
      ];
      for (const c of candidates) {
        if (MR.isTypeSupported(c)) return c;
      }
      return "";
    },
    extFromMime(mime) {
      const m = (mime || "").toLowerCase();
      if (m.includes("webm")) return "webm";
      if (m.includes("mp4")) return "mp4";
      if (m.includes("mpeg")) return "mp3";
      if (m.includes("ogg")) return "ogg";
      if (m.includes("wav")) return "wav";
      return "webm";
    },
    async startRecording() {
      if (this.isEditing) return;
      const win = this.getWin();
      if (!win?.MediaRecorder || !win?.navigator?.mediaDevices?.getUserMedia) {
        this.errorMessage = "Tu navegador no soporta grabación de audio.";
        this.state = "error";
        return;
      }
      try {
        this._stream = await win.navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        this.errorMessage =
          "No se pudo acceder al micrófono. Puedes subir un archivo en su lugar.";
        this.state = "error";
        return;
      }
      this._chunks = [];
      this._mimeType = this.pickMimeType(win);
      try {
        this._mediaRecorder = this._mimeType
          ? new win.MediaRecorder(this._stream, { mimeType: this._mimeType })
          : new win.MediaRecorder(this._stream);
      } catch (e) {
        this.teardownStream();
        this.errorMessage = "No se pudo iniciar la grabación.";
        this.state = "error";
        return;
      }
      this._mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) this._chunks.push(ev.data);
      };
      this._mediaRecorder.onstop = () => this.finalize();
      this._mediaRecorder.start();
      this.elapsed = 0;
      this._startTs = Date.now();
      this.state = "recording";
      this._timerId = win.setInterval(() => this.tick(), 250);
      this.$nextTick(() => this.startVisualizer(win));
    },
    tick() {
      this.elapsed = Math.floor((Date.now() - this._startTs) / 1000);
      if (this.elapsed >= this.maxDurationSeconds) this.stopRecording();
    },
    stopRecording() {
      const win = this.getWin();
      // Duración real medida al grabar (el blob no la expone de forma fiable).
      this.recordedDuration = this._startTs
        ? Math.max(0, (Date.now() - this._startTs) / 1000)
        : this.elapsed;
      if (this._timerId) {
        win.clearInterval(this._timerId);
        this._timerId = null;
      }
      this.stopVisualizer(win);
      if (this._mediaRecorder && this._mediaRecorder.state !== "inactive") {
        this._mediaRecorder.stop();
      } else {
        this.finalize();
      }
    },
    finalize() {
      const win = this.getWin();
      const type =
        this._mimeType || (this._chunks[0] && this._chunks[0].type) || "audio/webm";
      const blob = new win.Blob(this._chunks, { type });
      const ext = this.extFromMime(type);
      const name = `grabacion_${Date.now()}.${ext}`;
      this.recordedFile = new win.File([blob], name, { type });
      if (this.previewUrl) win.URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = blob.size > 0 ? win.URL.createObjectURL(blob) : null;
      this.teardownStream();
      this.state = "preview";
    },
    // Reproductor custom del preview. Los blobs WebM de MediaRecorder tienen duration=Infinity y
    // seekable=0 → el <audio> nativo no puede mostrar la duración total ni permitir seek. Usamos la
    // duración medida al grabar (recordedDuration) para el total y timeupdate para el actual.
    fmtTime(sec) {
      const s = Number.isFinite(sec) && sec > 0 ? sec : 0;
      const m = Math.floor(s / 60);
      const ss = Math.floor(s % 60);
      return `${m}:${String(ss).padStart(2, "0")}`;
    },
    togglePlay() {
      const a = this.$refs.previewAudio;
      if (!a) return;
      if (a.paused) {
        a.play().catch(() => {});
      } else {
        a.pause();
      }
    },
    onTimeUpdate() {
      // Fallback: timeupdate solo dispara ~4×/s. El avance fino lo maneja el loop rAF.
      const a = this.$refs.previewAudio;
      if (a && !this.isPlaying) this.currentTime = a.currentTime;
    },
    onPlay() {
      this.isPlaying = true;
      this.startProgressLoop();
    },
    onPause() {
      this.isPlaying = false;
      this.stopProgressLoop();
    },
    startProgressLoop() {
      const win = this.getWin();
      this.stopProgressLoop();
      const tick = () => {
        const a = this.$refs.previewAudio;
        if (!a) return;
        this.currentTime = a.currentTime;
        if (!a.paused && !a.ended) {
          this._progressRafId = win.requestAnimationFrame(tick);
        }
      };
      this._progressRafId = win.requestAnimationFrame(tick);
    },
    stopProgressLoop() {
      if (this._progressRafId) {
        this.getWin().cancelAnimationFrame(this._progressRafId);
        this._progressRafId = null;
      }
    },
    onEnded() {
      this.isPlaying = false;
      this.stopProgressLoop();
      // Al terminar, mostramos el total completo (no podemos confiar en audio.currentTime).
      this.currentTime = this.recordedDuration;
    },
    discardRecording() {
      this.cleanupPreview();
      this.reset();
    },
    saveRecording() {
      if (!this.hasAudio) return;
      this.$emit("trigger-event", {
        name: "saved",
        event: { value: this.recordedFile },
      });
      this.cleanupPreview();
      this.reset();
    },
    reset() {
      this.state = "idle";
      this.elapsed = 0;
      this.errorMessage = "";
      this.isPlaying = false;
      this.currentTime = 0;
      this.recordedDuration = 0;
    },
    teardownStream() {
      if (this._stream) {
        this._stream.getTracks().forEach((t) => t.stop());
        this._stream = null;
      }
    },
    cleanupPreview() {
      const win = this.getWin();
      const a = this.$refs.previewAudio;
      if (a) { try { a.pause(); } catch (e) { /* noop */ } }
      this.stopProgressLoop();
      this.isPlaying = false;
      this.currentTime = 0;
      if (this.previewUrl) {
        win.URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = null;
      }
      this.recordedFile = null;
      this._chunks = [];
    },
    startVisualizer(win) {
      const AudioCtx = win.AudioContext || win.webkitAudioContext;
      if (!AudioCtx || !this._stream) return;
      try {
        this._audioContext = new AudioCtx();
        this._analyser = this._audioContext.createAnalyser();
        this._analyser.fftSize = 64;
        this._analyser.smoothingTimeConstant = 0.5;
        const source = this._audioContext.createMediaStreamSource(this._stream);
        source.connect(this._analyser);
        this._freqData = new Uint8Array(this._analyser.frequencyBinCount);
        this._waveformSamples = [];
        this._lastSampleTime = 0;
        this.drawBars(win);
      } catch (e) {
        // visualizer is optional — fail silently
      }
    },
    stopVisualizer(win) {
      if (this._animFrameId) {
        win.cancelAnimationFrame(this._animFrameId);
        this._animFrameId = null;
      }
      if (this._audioContext) {
        try { this._audioContext.close(); } catch (e) {}
        this._audioContext = null;
        this._analyser = null;
        this._freqData = null;
      }
      this._waveformSamples = [];
      this._lastSampleTime = 0;
    },
    drawBars(win) {
      const canvas = this.$refs.waveformCanvas;
      if (!canvas || !this._analyser) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width;
      const H = canvas.height;

      // Sample amplitude at fixed interval and push to timeline
      const now = Date.now();
      if (now - this._lastSampleTime >= 80) {
        this._lastSampleTime = now;
        this._analyser.getByteFrequencyData(this._freqData);
        let sum = 0;
        for (let i = 0; i < this._freqData.length; i++) sum += this._freqData[i];
        this._waveformSamples.push(sum / this._freqData.length / 255);
      }

      // Draw timeline left-to-right, scroll when full
      const BAR_W = 3;
      const GAP = 2;
      const STEP = BAR_W + GAP;
      const maxBars = Math.floor(W / STEP);
      const samples = this._waveformSamples;
      const startIdx = Math.max(0, samples.length - maxBars);
      const visible = samples.slice(startIdx);

      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < visible.length; i++) {
        const val = visible[i];
        const barH = Math.max(4, val * H * 0.9);
        const x = i * STEP;
        const y = (H - barH) / 2;
        const isLast = i === visible.length - 1;
        ctx.fillStyle = isLast ? "#16a34a" : "#22c55e";
        ctx.globalAlpha = isLast ? 1 : 0.55 + val * 0.45;
        ctx.fillRect(Math.round(x), Math.round(y), BAR_W, Math.round(barH));
      }
      ctx.globalAlpha = 1;

      this._animFrameId = win.requestAnimationFrame(() => this.drawBars(win));
    },
  },
  beforeUnmount() {
    const win = this.getWin();
    if (this._timerId) win.clearInterval(this._timerId);
    this.stopVisualizer(win);
    this.teardownStream();
    this.cleanupPreview();
  },
};
</script>

<style scoped>
.audio-recorder {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ar-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ar-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
.ar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ar-btn-primary {
  background: #166534;
  color: #fff;
  border-color: #166534;
}
.ar-btn-danger {
  background: #b91c1c;
  color: #fff;
  border-color: #b91c1c;
}
.ar-timer {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.ar-hint {
  color: #6b7280;
  font-size: 13px;
}
.ar-audio-hidden {
  display: none;
}
.ar-player {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 320px;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  box-sizing: border-box;
}
.ar-play-btn {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  background: #166534;
  color: #fff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.ar-progress {
  flex: 1 1 auto;
  height: 6px;
  background: #d1fae5;
  border-radius: 3px;
  overflow: hidden;
}
.ar-progress-fill {
  height: 100%;
  background: #16a34a;
  border-radius: 3px;
}
.ar-time {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  color: #166534;
}
.ar-canvas {
  width: 100%;
  max-width: 280px;
  height: 48px;
  border-radius: 6px;
  background: #f0fdf4;
  display: block;
}
.ar-error {
  color: #b91c1c;
  font-size: 14px;
  margin: 0;
}
</style>
