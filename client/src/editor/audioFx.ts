/**
 * One audio effect chain, shared by the live preview and the offline export
 * mix — the same reasoning as drawFrame. Two copies of this logic would drift,
 * and the first anyone would notice is an exported file that sounds wrong.
 *
 * Everything here is built out of standard nodes, so it runs identically in an
 * AudioContext and an OfflineAudioContext.
 */
import { AudioFx, AudioFxKind } from "./model";

/** A cheap decaying-noise impulse response; good enough for a room tail. */
export function impulse(context: BaseAudioContext, seconds: number) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
  }
  return buffer;
}

/** Soft-clipping curve for the drive-based effects. */
function driveCurve(amount: number) {
  const k = 1 + amount * 120;
  const size = 1024;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const x = (i * 2) / size - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** Voices that need an oscillator or similar have to be started explicitly. */
type Chain = { tail: AudioNode; start: () => void; stop: () => void };

const plain = (tail: AudioNode): Chain => ({
  tail,
  start: () => {},
  stop: () => {},
});

/**
 * Wire `input` through the effect and return the end of the chain, plus the
 * handles needed to run any generators inside it.
 */
export function buildFxChain(
  context: BaseAudioContext,
  input: AudioNode,
  fx: AudioFx
): Chain {
  const kind: AudioFxKind = fx?.kind ?? "none";
  const amount = Math.max(0, Math.min(1, fx?.amount ?? 0.4));
  if (kind === "none") return plain(input);

  switch (kind) {
    case "lowpass":
    case "highpass": {
      const filter = context.createBiquadFilter();
      filter.type = kind;
      filter.frequency.value =
        kind === "lowpass" ? 320 + (1 - amount) * 9000 : 40 + amount * 2400;
      input.connect(filter);
      return plain(filter);
    }

    case "telephone": {
      // The classic band-limited handset: everything outside speech is gone.
      const low = context.createBiquadFilter();
      low.type = "highpass";
      low.frequency.value = 400;
      const high = context.createBiquadFilter();
      high.type = "lowpass";
      high.frequency.value = 3000;
      const edge = context.createWaveShaper();
      edge.curve = driveCurve(amount * 0.3);
      input.connect(low).connect(high).connect(edge);
      return plain(edge);
    }

    case "radio": {
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1600;
      band.Q.value = 0.9;
      const edge = context.createWaveShaper();
      edge.curve = driveCurve(0.3 + amount * 0.5);
      const trim = context.createGain();
      trim.gain.value = 0.7;
      input.connect(band).connect(edge).connect(trim);
      return plain(trim);
    }

    case "distort": {
      const edge = context.createWaveShaper();
      edge.curve = driveCurve(amount);
      const trim = context.createGain();
      // Drive adds level; pull it back so turning the knob is not a volume dial.
      trim.gain.value = 1 - amount * 0.45;
      input.connect(edge).connect(trim);
      return plain(trim);
    }

    case "denoise": {
      // Not spectral denoising — a rumble cut, a mains-hum notch and a hiss
      // trim. That is what it does, and it genuinely cleans up a room take.
      const rumble = context.createBiquadFilter();
      rumble.type = "highpass";
      rumble.frequency.value = 80 + amount * 60;
      const hum = context.createBiquadFilter();
      hum.type = "notch";
      hum.frequency.value = 60;
      hum.Q.value = 12;
      const hiss = context.createBiquadFilter();
      hiss.type = "lowpass";
      hiss.frequency.value = 11000 - amount * 3500;
      input.connect(rumble).connect(hum).connect(hiss);
      return plain(hiss);
    }

    case "robot": {
      // Ring modulation: the carrier multiplies the signal, so it is wired to
      // a gain node's gain rather than into the audio path.
      const ring = context.createGain();
      ring.gain.value = 0;
      const carrier = context.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = 28 + amount * 90;
      carrier.connect(ring.gain);

      const merge = context.createGain();
      const dry = context.createGain();
      const wet = context.createGain();
      dry.gain.value = 1 - amount * 0.75;
      wet.gain.value = amount;
      input.connect(dry).connect(merge);
      input.connect(ring).connect(wet).connect(merge);

      return {
        tail: merge,
        start: () => carrier.start(0),
        stop: () => {
          try {
            carrier.stop();
          } catch {
            /* already stopped */
          }
        },
      };
    }

    case "chorus": {
      const merge = context.createGain();
      const dry = context.createGain();
      const wet = context.createGain();
      dry.gain.value = 1;
      wet.gain.value = amount * 0.8;
      input.connect(dry).connect(merge);

      const delay = context.createDelay(0.1);
      delay.delayTime.value = 0.022;
      const sweep = context.createOscillator();
      sweep.frequency.value = 0.6;
      const depth = context.createGain();
      depth.gain.value = 0.004 + amount * 0.006;
      sweep.connect(depth).connect(delay.delayTime);
      input.connect(delay).connect(wet).connect(merge);

      return {
        tail: merge,
        start: () => sweep.start(0),
        stop: () => {
          try {
            sweep.stop();
          } catch {
            /* already stopped */
          }
        },
      };
    }

    case "echo":
    case "reverb":
    default: {
      const merge = context.createGain();
      const dry = context.createGain();
      const wet = context.createGain();
      dry.gain.value = 1 - amount * 0.5;
      wet.gain.value = amount;
      input.connect(dry).connect(merge);

      if (kind === "echo") {
        const delay = context.createDelay(2);
        delay.delayTime.value = 0.12 + amount * 0.38;
        const feedback = context.createGain();
        feedback.gain.value = Math.min(0.65, amount * 0.7);
        input.connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(wet).connect(merge);
      } else {
        const convolver = context.createConvolver();
        convolver.buffer = impulse(context, 1.1 + amount * 1.8);
        input.connect(convolver);
        convolver.connect(wet).connect(merge);
      }
      return plain(merge);
    }
  }
}
