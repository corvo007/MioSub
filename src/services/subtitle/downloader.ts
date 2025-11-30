import { OutputFormat } from '@/types/subtitle';

export const downloadFile = (filename: string, content: string, format: OutputFormat) => {
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
