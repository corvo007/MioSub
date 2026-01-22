export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (result) {
        const base64 = result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error: ' + reader.error?.message));
    reader.onabort = () => reject(new Error('FileReader aborted'));
    reader.readAsDataURL(blob);
  });
};
