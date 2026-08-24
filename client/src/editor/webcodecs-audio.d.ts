/**
 * TypeScript's DOM lib ships VideoEncoder/VideoFrame but not the audio half of
 * WebCodecs yet. Only what the exporter actually touches is declared here.
 */
interface AudioDataInit {
  format:
    | "f32"
    | "f32-planar"
    | "s16"
    | "s16-planar"
    | "s32"
    | "s32-planar"
    | "u8"
    | "u8-planar";
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: BufferSource;
}

declare class AudioData {
  constructor(init: AudioDataInit);
  readonly duration: number;
  readonly numberOfFrames: number;
  close(): void;
}

interface AudioEncoderConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
}

interface AudioEncoderInit {
  output: (chunk: EncodedAudioChunk, metadata?: unknown) => void;
  error: (error: DOMException) => void;
}

declare class AudioEncoder {
  constructor(init: AudioEncoderInit);
  readonly encodeQueueSize: number;
  configure(config: AudioEncoderConfig): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  close(): void;
}
