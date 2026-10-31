#!/usr/bin/env node
/**
 * scripts/gen-siren.mjs
 * Generates assets/siren.wav — original PCM16 siren sound, no copyright.
 *
 * Spec: 22050 Hz mono PCM16, 2.0 s
 *       f(t) = 1100 + 400 * triangle(2π * 0.5 * t) Hz sweep
 *       amplitude 0.95
 *
 * Usage: node scripts/gen-siren.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE_RATE = 22050;
const DURATION = 2.0;
const AMPLITUDE = 0.95;
const FREQ_CENTER = 1100;
const FREQ_RANGE = 400;
const SWEEP_HZ = 0.5;

const numSamples = Math.floor(SAMPLE_RATE * DURATION);

/** Triangle wave: returns value in [-1, 1] */
function triangle(phase) {
  const p = (phase % (2 * Math.PI)) / (2 * Math.PI);
  return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
}

const samples = new Int16Array(numSamples);
let phaseAccum = 0;

for (let i = 0; i < numSamples; i++) {
  const t = i / SAMPLE_RATE;
  const modulator = triangle(2 * Math.PI * SWEEP_HZ * t);
  const freq = FREQ_CENTER + FREQ_RANGE * modulator;
  phaseAccum += (2 * Math.PI * freq) / SAMPLE_RATE;
  const sample = AMPLITUDE * Math.sin(phaseAccum);
  samples[i] = Math.round(sample * 32767);
}

// Write WAV file
const dataChunkSize = numSamples * 2;
const fileSize = 44 + dataChunkSize;
const buf = Buffer.alloc(fileSize);

buf.write('RIFF', 0);
buf.writeUInt32LE(fileSize - 8, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);       // chunk size
buf.writeUInt16LE(1, 20);        // PCM
buf.writeUInt16LE(1, 22);        // mono
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
buf.writeUInt16LE(2, 32);        // block align
buf.writeUInt16LE(16, 34);       // bits per sample
buf.write('data', 36);
buf.writeUInt32LE(dataChunkSize, 40);

for (let i = 0; i < numSamples; i++) {
  buf.writeInt16LE(samples[i], 44 + i * 2);
}

const outPath = join(__dirname, '..', 'apps', 'mobile', 'assets', 'siren.wav');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buf);

console.log(`✅ Generated siren.wav: ${(fileSize / 1024).toFixed(1)} KB at ${outPath}`);
console.log(`   Spec: ${SAMPLE_RATE}Hz mono PCM16, ${DURATION}s, ${FREQ_CENTER}±${FREQ_RANGE}Hz sweep at ${SWEEP_HZ}Hz`);
