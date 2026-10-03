import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function readFileAsBase64(uri: string): Promise<string> {
  console.log('[fileHelpers] readFileAsBase64 called', { uri });
  const base64 = await FileSystemLegacy.readAsStringAsync(uri, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });
  console.log('[fileHelpers] readFileAsBase64 complete, length:', base64.length);
  return base64;
}

export async function saveAndShareFile(base64: string, fileName: string): Promise<void> {
  console.log('[fileHelpers] saveAndShareFile called', { fileName });
  const fileUri = FileSystemLegacy.documentDirectory + fileName;
  await FileSystemLegacy.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });
  console.log('[fileHelpers] file saved to', fileUri);
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: fileName.endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv',
      dialogTitle: `Esporta ${fileName}`,
    });
    console.log('[fileHelpers] file shared successfully');
  } else {
    console.log('[fileHelpers] sharing not available on this platform');
  }
}
