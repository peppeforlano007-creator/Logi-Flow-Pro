import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AlertCircle } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';

export interface ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  hint?: string;
}

const VIEWFINDER_SIZE = 260;
const CORNER_SIZE = 28;
const CORNER_THICKNESS = 4;

export function ScannerModal({ visible, onClose, onScanned, hint = 'Inquadra il barcode' }: ScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const debounceRef = useRef(false);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (debounceRef.current) return;
      debounceRef.current = true;
      console.log('[ScannerModal] Barcode scanned:', data);
      onScanned(data);
      setTimeout(() => {
        debounceRef.current = false;
      }, 1500);
    },
    [onScanned],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <StatusBar hidden />
      <View style={styles.scannerContainer}>
        {!permission?.granted ? (
          <View style={styles.permissionContainer}>
            <AlertCircle size={48} color="#FFFFFF" />
            <Text style={styles.permissionTitle}>Accesso fotocamera richiesto</Text>
            <Text style={styles.permissionSubtitle}>
              Per scansionare i barcode è necessario il permesso fotocamera.
            </Text>
            <AnimatedPressable
              onPress={() => {
                console.log('[ScannerModal] Requesting camera permission');
                requestPermission();
              }}
            >
              <View style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>Concedi permesso</Text>
              </View>
            </AnimatedPressable>
            <AnimatedPressable onPress={() => {
              console.log('[ScannerModal] Permission screen closed');
              onClose();
            }}>
              <Text style={styles.closeTextButton}>Chiudi</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={handleBarcode}
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr', 'code128', 'code39', 'ean13', 'ean8',
                  'upc_a', 'upc_e', 'pdf417', 'aztec', 'datamatrix',
                ],
              }}
            />
            {/* Dark overlay */}
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.viewfinder}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom}>
                <Text style={styles.scanHint}>{hint}</Text>
              </View>
            </View>
            {/* Close button */}
            <AnimatedPressable
              onPress={() => {
                console.log('[ScannerModal] Scanner closed by user');
                onClose();
              }}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>✕  Chiudi</Text>
            </AnimatedPressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: VIEWFINDER_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: 24,
  },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#FFFFFF',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 4,
  },
  scanHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: '#1A56DB',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginTop: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  closeTextButton: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 8,
  },
});
