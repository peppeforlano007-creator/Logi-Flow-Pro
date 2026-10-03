import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Modal,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanLine, CheckCircle2, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react-native';
import { COLORS } from '@/constants/AppColors';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ToastMessage, useToast } from '@/components/ToastMessage';
import { db } from '@/utils/db';
import type { SupplierFile, SupplierItem } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PkgGroup {
  pkgId: string;
  items: SupplierItem[];
  isReceived: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectPkgColumn(items: SupplierItem[]): string | null {
  if (items.length === 0) return null;
  const keys = Object.keys(items[0].original_data ?? {});
  // Priority 1: exact pkgid
  const exact = keys.find(k => k.toLowerCase() === 'pkgid');
  if (exact) return exact;
  // Priority 2: contains pkg
  const pkg = keys.find(k => k.toLowerCase().includes('pkg'));
  if (pkg) return pkg;
  // Priority 3: contains barcode/codice/code/id
  const fallback = keys.find(k =>
    k.toLowerCase().includes('barcode') ||
    k.toLowerCase().includes('codice') ||
    k.toLowerCase().includes('code') ||
    k.toLowerCase().includes('id')
  );
  return fallback ?? null;
}

function groupByPkgId(items: SupplierItem[], column: string): PkgGroup[] {
  const map = new Map<string, SupplierItem[]>();
  for (const item of items) {
    const raw = item.original_data?.[column] ?? '';
    const key = String(raw).trim() || '__NO_PKGID__';
    const existing = map.get(key) ?? [];
    existing.push(item);
    map.set(key, existing);
  }
  const groups: PkgGroup[] = [];
  map.forEach((groupItems, pkgId) => {
    const isReceived = groupItems.every(i => i.extra_data?.received === 'true');
    groups.push({ pkgId, items: groupItems, isReceived });
  });
  // Sort: not received first, then received
  groups.sort((a, b) => {
    if (a.isReceived === b.isReceived) return a.pkgId.localeCompare(b.pkgId);
    return a.isReceived ? 1 : -1;
  });
  return groups;
}

// ─── Scanner Overlay ─────────────────────────────────────────────────────────

function ScannerModal({
  visible,
  onClose,
  onScanned,
  columnName,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  columnName: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const debounceRef = useRef(false);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (debounceRef.current) return;
      debounceRef.current = true;
      console.log('[Reception] Barcode scanned:', data);
      onScanned(data);
      setTimeout(() => {
        debounceRef.current = false;
      }, 1500);
    },
    [onScanned],
  );

  if (!visible) return null;

  const scanHintText = `Inquadra il barcode di ${columnName}`;

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
            <AnimatedPressable onPress={() => {
              console.log('[Reception] Requesting camera permission');
              requestPermission();
            }}>
              <View style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>Concedi permesso</Text>
              </View>
            </AnimatedPressable>
            <AnimatedPressable onPress={onClose}>
              <Text style={styles.closeTextButton}>Chiudi</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={handleBarcode}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'pdf417', 'aztec', 'datamatrix'] }}
            />
            {/* Dark overlay */}
            <View style={styles.overlay} pointerEvents="none">
              {/* Top dark area */}
              <View style={styles.overlayTop} />
              {/* Middle row */}
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                {/* Viewfinder */}
                <View style={styles.viewfinder}>
                  {/* Corners */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <View style={styles.overlaySide} />
              </View>
              {/* Bottom dark area */}
              <View style={styles.overlayBottom}>
                <Text style={styles.scanHint}>{scanHintText}</Text>
              </View>
            </View>
            {/* Close button */}
            <AnimatedPressable
              onPress={() => {
                console.log('[Reception] Scanner closed by user');
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

// ─── PkgGroup Card ────────────────────────────────────────────────────────────

function PkgGroupCard({ group }: { group: PkgGroup }) {
  const itemCount = group.items.length;
  const itemCountLabel = itemCount === 1 ? '1 articolo' : `${itemCount} articoli`;
  const itemCodes = group.items.map(i => i.item_code).filter(Boolean).join(', ');

  if (group.isReceived) {
    return (
      <View style={styles.groupCardReceived}>
        <View style={styles.groupCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupPkgIdReceived}>{group.pkgId}</Text>
            <Text style={styles.groupCountReceived}>{itemCountLabel}</Text>
          </View>
          <CheckCircle2 size={28} color="#16A34A" />
        </View>
        {itemCodes ? (
          <Text style={styles.groupItemCodesReceived} numberOfLines={2}>
            {itemCodes}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupPkgId}>{group.pkgId}</Text>
          <Text style={styles.groupCount}>{itemCountLabel}</Text>
        </View>
        <View style={styles.groupBadgePending}>
          <Text style={styles.groupBadgePendingText}>Da scansionare</Text>
        </View>
      </View>
      {itemCodes ? (
        <Text style={styles.groupItemCodes} numberOfLines={2}>
          {itemCodes}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Column Picker ────────────────────────────────────────────────────────────

function ColumnPicker({
  columns,
  onSelect,
}: {
  columns: string[];
  onSelect: (col: string) => void;
}) {
  return (
    <View style={styles.columnPickerCard}>
      <Text style={styles.columnPickerTitle}>
        Seleziona la colonna da usare come identificatore barcode
      </Text>
      {columns.map(col => (
        <TouchableOpacity
          key={col}
          style={styles.columnPickerRow}
          onPress={() => {
            console.log('[Reception] Column selected:', col);
            onSelect(col);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.columnPickerRowText}>{col}</Text>
          <ChevronRight size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReceptionScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const { toast, showToast, hideToast } = useToast();

  const [file, setFile] = useState<SupplierFile | null>(null);
  const [items, setItems] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [processingCode, setProcessingCode] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    console.log('[Reception] fetchData called', { fileId });
    try {
      const [fileRes, itemsRes] = await Promise.all([
        db.from('supplier_files').select('*').eq('id', fileId).single(),
        db.from('supplier_items').select('*').eq('file_id', fileId).order('row_index', { ascending: true }),
      ]);

      if (fileRes.error) {
        console.error('[Reception] file fetch error:', fileRes.error);
        throw fileRes.error;
      }
      if (itemsRes.error) {
        console.error('[Reception] items fetch error:', itemsRes.error);
        throw itemsRes.error;
      }

      const fetchedItems = (itemsRes.data ?? []) as SupplierItem[];
      console.log('[Reception] fetchData success, items:', fetchedItems.length);
      setFile(fileRes.data as SupplierFile);
      setItems(fetchedItems);

      const detected = detectPkgColumn(fetchedItems);
      console.log('[Reception] Auto-detected column:', detected);
      setSelectedColumn(detected);
    } catch (err) {
      console.error('[Reception] fetchData exception:', err);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Barcode handler ────────────────────────────────────────────────────────

  const handleScanned = useCallback(
    async (code: string) => {
      if (processingCode) return;
      if (!selectedColumn) return;
      setProcessingCode(true);
      console.log('[Reception] handleScanned start', { code, fileId, column: selectedColumn });

      try {
        const normalizedCode = code.trim().toLowerCase();
        const matched = items.filter(item => {
          const val = item.original_data?.[selectedColumn] ?? '';
          return String(val).trim().toLowerCase() === normalizedCode;
        });

        if (matched.length === 0) {
          console.log('[Reception] No items found for code:', code);
          showToast(`Nessun articolo trovato per ${selectedColumn}: ${code}`, 'error');
          setProcessingCode(false);
          return;
        }

        console.log('[Reception] Found', matched.length, 'items for', selectedColumn, ':', code);

        // Ensure extra_columns has received / received_at
        const currentExtraColumns: string[] = file?.extra_columns ?? [];
        const newColumns = ['received', 'received_at'].filter(c => !currentExtraColumns.includes(c));
        if (newColumns.length > 0) {
          console.log('[Reception] Adding extra_columns:', newColumns);
          const { error: colErr } = await db
            .from('supplier_files')
            .update({ extra_columns: [...currentExtraColumns, ...newColumns] })
            .eq('id', fileId);
          if (colErr) console.error('[Reception] extra_columns update error:', colErr);
          else {
            setFile(prev => prev ? { ...prev, extra_columns: [...currentExtraColumns, ...newColumns] } : prev);
          }
        }

        // Update each matched item
        const now = new Date().toISOString();
        for (const item of matched) {
          const { error: itemErr } = await db
            .from('supplier_items')
            .update({
              status: 'processing',
              extra_data: {
                ...item.extra_data,
                received: 'true',
                received_at: now,
              },
            })
            .eq('id', item.id);
          if (itemErr) console.error('[Reception] item update error:', itemErr, item.id);
        }

        // Optimistic local update
        setItems(prev =>
          prev.map(item => {
            const val = item.original_data?.[selectedColumn] ?? '';
            if (String(val).trim().toLowerCase() !== normalizedCode) return item;
            return {
              ...item,
              status: 'processing' as const,
              extra_data: { ...item.extra_data, received: 'true', received_at: now },
            };
          }),
        );

        const countLabel = matched.length === 1 ? '1 articolo ricevuto' : `${matched.length} articoli ricevuti`;
        showToast(`${countLabel} per ${selectedColumn}: ${code}`, 'success');
        console.log('[Reception] handleScanned success', { code, column: selectedColumn, count: matched.length });
      } catch (err: any) {
        console.error('[Reception] handleScanned error:', err);
        showToast(err?.message ?? 'Errore durante la scansione', 'error');
      } finally {
        setProcessingCode(false);
      }
    },
    [items, file, fileId, processingCode, selectedColumn, showToast],
  );

  // ── Mark complete ──────────────────────────────────────────────────────────

  const handleMarkComplete = useCallback(async () => {
    console.log('[Reception] handleMarkComplete pressed', { fileId });
    setMarkingComplete(true);
    try {
      const { error } = await db
        .from('supplier_files')
        .update({ status: 'received', received_at: new Date().toISOString() })
        .eq('id', fileId);

      if (error) {
        console.error('[Reception] markComplete error:', error);
        throw error;
      }

      console.log('[Reception] File marked as received');
      showToast('File segnato come ricevuto completamente', 'success');
      setFile(prev => prev ? { ...prev, status: 'received' } : prev);
    } catch (err: any) {
      console.error('[Reception] handleMarkComplete error:', err);
      showToast(err?.message ?? 'Errore', 'error');
    } finally {
      setMarkingComplete(false);
    }
  }, [fileId, showToast]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const hasColumn = selectedColumn !== null;
  const groups = hasColumn ? groupByPkgId(items, selectedColumn!) : [];
  const scannedCount = groups.filter(g => g.isReceived).length;
  const totalCount = groups.length;
  const progressRatio = totalCount > 0 ? scannedCount / totalCount : 0;
  const isAlreadyReceived = file?.status === 'received';

  const progressLabel = `${scannedCount} / ${totalCount} ${selectedColumn ?? 'ID'} scansionati`;

  // All column headers for the picker
  const allColumns = items.length > 0 ? Object.keys(items[0].original_data ?? {}) : [];

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Stack.Screen
        options={{
          title: file?.file_name ?? 'Ricezione',
          headerLargeTitle: false,
        }}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}
      >
        {/* Progress card */}
        {hasColumn && items.length > 0 && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>{progressLabel}</Text>
              <Text style={styles.progressPercent}>
                {Math.round(progressRatio * 100)}%
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressRatio * 100}%` as any }]} />
            </View>
          </View>
        )}

        {/* Scan button */}
        {!isAlreadyReceived && hasColumn && (
          <AnimatedPressable
            onPress={() => {
              console.log('[Reception] Open scanner pressed, column:', selectedColumn);
              setScannerOpen(true);
            }}
          >
            <View style={styles.scanButton}>
              <ScanLine size={22} color="#FFFFFF" />
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.scanButtonText}>Scansiona Barcode</Text>
                <Text style={styles.scanButtonSubtext}>Colonna: {selectedColumn}</Text>
              </View>
            </View>
          </AnimatedPressable>
        )}

        {/* Column picker — shown when no column detected and items exist */}
        {items.length > 0 && !hasColumn && (
          <ColumnPicker
            columns={allColumns}
            onSelect={col => setSelectedColumn(col)}
          />
        )}

        {/* Change column link — shown when a column is selected */}
        {hasColumn && items.length > 0 && (
          <View style={styles.changeColumnRow}>
            <Text style={styles.changeColumnLabel}>
              Colonna identificatore:
            </Text>
            <Text style={styles.changeColumnValue}>{selectedColumn}</Text>
            <TouchableOpacity
              onPress={() => {
                console.log('[Reception] Change column pressed, current:', selectedColumn);
                setSelectedColumn(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.changeColumnLink}>Cambia</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Groups list */}
        {hasColumn && groups.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Gruppi {selectedColumn}</Text>
            {groups.map(group => (
              <PkgGroupCard key={group.pkgId} group={group} />
            ))}
          </View>
        )}

        {/* Already received banner */}
        {isAlreadyReceived && (
          <View style={styles.receivedBanner}>
            <CheckCircle size={20} color={COLORS.accent} />
            <Text style={styles.receivedBannerText}>File ricevuto completamente</Text>
          </View>
        )}

        {/* Mark complete button */}
        {!isAlreadyReceived && (
          <AnimatedPressable
            onPress={handleMarkComplete}
            disabled={markingComplete}
          >
            <View style={styles.completeButton}>
              {markingComplete ? (
                <ActivityIndicator color={COLORS.accent} size="small" />
              ) : (
                <CheckCircle size={18} color={COLORS.accent} />
              )}
              <Text style={styles.completeButtonText}>
                {markingComplete ? 'Aggiornamento...' : 'Segna come Ricevuto Completamente'}
              </Text>
            </View>
          </AnimatedPressable>
        )}
      </ScrollView>

      {/* Scanner modal */}
      <ScannerModal
        visible={scannerOpen}
        onClose={() => {
          console.log('[Reception] Scanner modal closed');
          setScannerOpen(false);
        }}
        onScanned={handleScanned}
        columnName={selectedColumn ?? ''}
      />

      <ToastMessage
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const VIEWFINDER_SIZE = 260;
const CORNER_SIZE = 28;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  // Progress
  progressCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 4,
  },

  // Scan button
  scanButton: {
    backgroundColor: '#1A56DB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  scanButtonSubtext: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },

  // Change column row
  changeColumnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  changeColumnLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  changeColumnValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  changeColumnLink: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Column picker
  columnPickerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  columnPickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
    lineHeight: 20,
  },
  columnPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  columnPickerRowText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },

  // Section title
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Group cards
  groupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  groupCardReceived: {
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#16A34A',
    gap: 6,
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupPkgId: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  groupPkgIdReceived: {
    fontSize: 17,
    fontWeight: '800',
    color: '#15803D',
  },
  groupCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  groupCountReceived: {
    fontSize: 12,
    color: '#16A34A',
    marginTop: 2,
  },
  groupBadgePending: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  groupBadgePendingText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  groupItemCodes: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  groupItemCodesReceived: {
    fontSize: 11,
    color: '#16A34A',
  },

  // Received banner
  receivedBanner: {
    backgroundColor: COLORS.accentMuted,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  receivedBannerText: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '600',
  },

  // Complete button
  completeButton: {
    backgroundColor: COLORS.accentMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  completeButtonText: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '700',
  },

  // Scanner modal
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

  // Permission screen
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
