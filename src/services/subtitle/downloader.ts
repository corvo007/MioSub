import { type OutputFormat } from '@/types/subtitle';
import { isElectron } from '@/services/utils/env';

export const downloadFile = async (filename: string, content: string, format: OutputFormat) => {
  // Electron: Use system save dialog
  if (isElectron()) {
    const result = await (window as any).electronAPI.saveSubtitleDialog(filename, content, format);
    return result.success ? result.path : null;
  }

  // Web: Use Blob download
  const windowsContent = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + windowsContent], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
