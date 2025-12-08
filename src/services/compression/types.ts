export interface CompressionOptions {
  encoder: 'libx264' | 'libx265';
  crf: number;
  width?: number;
  height?: number;
}

export interface CompressionProgress {
  percent: number;
  currentFps: number;
  currentKbps: number;
  targetSize: number;
  timemark: string;
}
