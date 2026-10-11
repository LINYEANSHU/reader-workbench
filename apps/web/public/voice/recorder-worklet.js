class ReaderRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.used = 0;
    this.port.onmessage = ({ data }) => {
      if (data === 'flush') {
        this.flush();
        this.port.postMessage({ flushed: true });
      }
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage({ samples }, [samples.buffer]);
    this.used = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let index = 0; index < channels[0].length; index++) {
      let sample = 0;
      for (const channel of channels) sample += channel[index];
      this.buffer[this.used++] = sample / channels.length;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('reader-recorder', ReaderRecorder);
