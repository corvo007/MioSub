export interface CompressionOptions {
  encoder: 'libx264' | 'libx265';
  crf: number;
  width?: number;
  height?: number;
  hwAccel?: 'auto' | 'off'; // GPU hardware acceleration mode
}

export interface HardwareAccelInfo {
  available: boolean;
  encoders: {
    h264_nvenc: boolean;
    hevc_nvenc: boolean;
    h264_qsv: boolean;
    hevc_qsv: boolean;
    h264_amf: boolean;
    hevc_amf: boolean;
  };
  preferredH264: string;
  preferredH265: string;
}

export interface CompressionProgress {
  percent: number;
  currentFps: number;
  currentKbps: number;
  targetSize: number;
  timemark: string;
}
