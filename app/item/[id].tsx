import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, Clock } from 'lucide-react-native';
import { COLORS } from '@/constants/AppColors';
import { ItemStatusBadge } from '@/components/StatusBadge';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ToastMessage, useToast } from '@/components/ToastMessage';
import { db } from '@/utils/db';
import type { SupplierItem, SupplierFile } from '@/types';

const CONDITIONS = [
  { label: 'PRODOTTO NON RICEVUTO', value: 'shortage' },
  { label: 'SCATOLA VUOTA',         value: 'empty box' },
  { label: 'PRODOTTO SBAGLIATO',    value: 'wrong device' },
  { label: 'DISPOSITIVO BLOCCATO',  value: 'cloud locked' },
  { label: 'SCADUTO',               value: 'expired' },
  { label: 'ALTRO',                 value: 'other' },
] as const;

const FIXED_VALUES = CONDITIONS.slice(0, 5).map(c => c.value);

const SELEZIONE_OPTIONS: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseUnitCost(data: Record<string, string>): number | null {
  const key = Object.keys(data).find(k => k.toLowerCase() === 'unitcost');
  if (!key) return null;
  const raw = String(data[key] ?? '').replace(',', '.');
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function formatPrice(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();

  const [item, setItem] = useState<SupplierItem | null>(null);
  const [file, setFile] = useState<SupplierFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [originalData, setOriginalData] = useState<Record<string, string>>({});
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [processedBy, setProcessedBy] = useState('');

  // AdjReason condition picker state
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [altroText, setAltroText] = useState('');

  // Selezione state
  const [selezione, setSelezione] = useState<'A' | 'B' | 'C' | null>(null);

  // Prezzo di Vendita state
  const [prezzoVendita, setPrezzoVendita] = useState('');

  // Track whether we've mounted so the selezione effect doesn't overwrite a restored price
  const isMounted = useRef(false);

  const fetchData = useCallback(async () => {
    console.log('[ItemDetail] fetchData called', { id });
    try {
      const { data: itemData, error: itemError } = await db
        .from('supplier_items')
        .select('*')
        .eq('id', id)
        .single();

      if (itemError) {
        console.error('[ItemDetail] item fetch error:', itemError);
        throw itemError;
      }

      const fetchedItem = itemData as SupplierItem;
      console.log('[ItemDetail] item fetched:', fetchedItem.item_code);
      setItem(fetchedItem);
      setOriginalData({ ...(fetchedItem.original_data ?? {}) });
      setExtraData({ ...(fetchedItem.extra_data ?? {}) });
      if (fetchedItem.processed_by) setProcessedBy(fetchedItem.processed_by);

      // Pre-select AdjReason condition from loaded data
      const adjValue: string = fetchedItem.original_data?.['AdjReason'] ?? '';
      if (adjValue === '') {
        setSelectedCondition(null);
        setAltroText('');
      } else if ((FIXED_VALUES as readonly string[]).includes(adjValue)) {
        setSelectedCondition(adjValue);
        setAltroText('');
      } else {
        // Non-empty value that doesn't match a fixed condition → ALTRO with free text
        setSelectedCondition('other');
        setAltroText(adjValue);
      }

      // Restore Selezione from extraData
      const savedSelezione = fetchedItem.extra_data?.['Selezione'];
      if (savedSelezione === 'A' || savedSelezione === 'B' || savedSelezione === 'C') {
        console.log('[ItemDetail] restoring selezione from extraData:', savedSelezione);
        setSelezione(savedSelezione);
      }

      // Restore PrezzoVendita from extraData (takes priority over computed value)
      const savedPrezzo = fetchedItem.extra_data?.['PrezzoVendita'];
      if (savedPrezzo !== undefined && savedPrezzo !== '') {
        console.log('[ItemDetail] restoring prezzoVendita from extraData:', savedPrezzo);
        setPrezzoVendita(savedPrezzo);
      }

      // Fetch file for extra_columns
      const { data: fileData, error: fileError } = await db
        .from('supplier_files')
        .select('*')
        .eq('id', fetchedItem.file_id)
        .single();

      if (!fileError && fileData) {
        console.log('[ItemDetail] file fetched:', fileData.file_name);
        setFile(fileData as SupplierFile);
        // Initialize extra_data with empty strings for any missing extra columns
        const extraCols: string[] = fileData.extra_columns ?? [];
        const currentExtra = { ...(fetchedItem.extra_data ?? {}) };
        extraCols.forEach(col => {
          if (!(col in currentExtra)) currentExtra[col] = '';
        });
        setExtraData(currentExtra);
      }
    } catch (err) {
      console.error('[ItemDetail] fetchData exception:', err);
    } finally {
      setLoading(false);
      // Mark as mounted after data is loaded so the selezione effect can run
      isMounted.current = true;
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Recompute prezzoVendita when selezione changes, but only after mount
  useEffect(() => {
    if (!isMounted.current) return;

    console.log('[ItemDetail] selezione changed, recomputing prezzoVendita:', selezione);
    const unitCost = parseUnitCost(originalData);

    if (selezione === null) {
      setPrezzoVendita('');
    } else if (unitCost === null) {
      setPrezzoVendita('');
    } else if (selezione === 'A') {
      setPrezzoVendita(formatPrice(unitCost));
    } else if (selezione === 'B') {
      setPrezzoVendita(formatPrice(unitCost * 0.70));
    } else if (selezione === 'C') {
      setPrezzoVendita(formatPrice(unitCost * 0.50));
    }
  }, [selezione]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConditionPress = useCallback((value: string) => {
    if (selectedCondition === value) {
      console.log('[ItemDetail] condition deselected:', value);
      setSelectedCondition(null);
      setAltroText('');
    } else {
      console.log('[ItemDetail] condition selected:', value);
      setSelectedCondition(value);
      if (value !== 'other') setAltroText('');
    }
  }, [selectedCondition]);

  const handleSelezionePress = useCallback((value: 'A' | 'B' | 'C') => {
    if (selezione === value) {
      console.log('[ItemDetail] selezione deselected:', value);
      setSelezione(null);
    } else {
      console.log('[ItemDetail] selezione selected:', value);
      setSelezione(value);
    }
  }, [selezione]);

  const handleSave = useCallback(async () => {
    console.log('[ItemDetail] handleSave called', { id, processedBy, selectedCondition, altroText, selezione, prezzoVendita });
    setSaving(true);
    try {
      // Compute final AdjReason value
      let adjReason = '';
      if (selectedCondition === null) {
        adjReason = '';
      } else if (selectedCondition === 'other') {
        adjReason = altroText.trim();
      } else {
        adjReason = selectedCondition;
      }

      const updatedOriginalData = { ...originalData, AdjReason: adjReason };
      console.log('[ItemDetail] saving AdjReason:', adjReason);

      const updatedExtraData = {
        ...extraData,
        Selezione: selezione ?? '',
        PrezzoVendita: prezzoVendita,
      };
      console.log('[ItemDetail] saving extraData with Selezione and PrezzoVendita:', { Selezione: updatedExtraData.Selezione, PrezzoVendita: updatedExtraData.PrezzoVendita });

      const { error } = await db
        .from('supplier_items')
        .update({
          original_data: updatedOriginalData,
          extra_data: updatedExtraData,
          status: 'completed',
          processed_at: new Date().toISOString(),
          processed_by: processedBy || null,
        })
        .eq('id', id);

      if (error) {
        console.error('[ItemDetail] save error:', error);
        throw error;
      }

      setOriginalData(updatedOriginalData);
      setExtraData(updatedExtraData);
      console.log('[ItemDetail] item saved successfully');
      showToast('Articolo salvato con successo', 'success');
      setTimeout(() => router.back(), 1200);
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error('[ItemDetail] handleSave error:', err);
      showToast(e?.message ?? 'Errore durante il salvataggio', 'error');
    } finally {
      setSaving(false);
    }
  }, [id, originalData, extraData, processedBy, selectedCondition, altroText, selezione, prezzoVendita, showToast, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <Stack.Screen options={{ title: 'Articolo', headerLargeTitle: false }} />
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const extraColumns = file?.extra_columns ?? [];
  const processedAtDisplay = item?.processed_at ? formatDate(item.processed_at) : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: item?.item_code ?? 'Articolo',
          headerLargeTitle: false,
        }}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}
      >
        {/* Status + processed info */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {item && <ItemStatusBadge status={item.status} />}
          {processedAtDisplay && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={13} color={COLORS.textSecondary} />
              <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                {processedAtDisplay}
              </Text>
            </View>
          )}
          {item?.processed_by && (
            <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
              da {item.processed_by}
            </Text>
          )}
        </View>

        {/* Condizione Articolo (AdjReason picker) */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            overflow: 'hidden',
          }}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
              Condizione Articolo
            </Text>
          </View>

          {CONDITIONS.map((condition, index) => {
            const isSelected = selectedCondition === condition.value;
            const isLast = index === CONDITIONS.length - 1;
            const isAltro = condition.value === 'other';

            return (
              <View key={condition.value}>
                <AnimatedPressable
                  onPress={() => handleConditionPress(condition.value)}
                >
                  <View
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      borderBottomWidth: isLast && !(isAltro && isSelected) ? 0 : 1,
                      borderBottomColor: COLORS.border,
                    }}
                  >
                    {/* Radio circle */}
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        backgroundColor: isSelected ? COLORS.primary : 'transparent',
                        borderColor: isSelected ? COLORS.primary : COLORS.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: '#FFFFFF',
                          }}
                        />
                      )}
                    </View>

                    {/* Labels */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>
                        {condition.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>
                        {condition.value}
                      </Text>
                    </View>
                  </View>
                </AnimatedPressable>

                {/* ALTRO free-text input */}
                {isAltro && isSelected && (
                  <View style={{ marginTop: 8, marginHorizontal: 16, marginBottom: 12 }}>
                    <TextInput
                      value={altroText}
                      onChangeText={(v) => {
                        console.log('[ItemDetail] altroText changed:', v);
                        setAltroText(v);
                      }}
                      placeholder="Descrivi il motivo..."
                      placeholderTextColor={COLORS.textTertiary}
                      autoFocus
                      style={{
                        backgroundColor: COLORS.surfaceSecondary,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 14,
                        color: COLORS.text,
                      }}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Selezione card */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            overflow: 'hidden',
          }}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
              Selezione
            </Text>
          </View>

          {SELEZIONE_OPTIONS.map((option, index) => {
            const isSelected = selezione === option;
            const isLast = index === SELEZIONE_OPTIONS.length - 1;

            return (
              <AnimatedPressable
                key={option}
                onPress={() => handleSelezionePress(option)}
              >
                <View
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: COLORS.border,
                  }}
                >
                  {/* Radio circle */}
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      backgroundColor: isSelected ? COLORS.primary : 'transparent',
                      borderColor: isSelected ? COLORS.primary : COLORS.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isSelected && (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#FFFFFF',
                        }}
                      />
                    )}
                  </View>

                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>
                    {option}
                  </Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>

        {/* Original data section — whitelist only, read-only */}
        {(() => {
          const VISIBLE_COLUMNS = ['EAN', 'ASIN', 'LPN', 'PKGID', 'UNITS', 'GLDESC', 'ITEMDESC', 'UNITCOST', 'AMAZONPRICE', 'REMOVALREASON', 'CATEGORYDESC', 'RECOVERYRETE'];
          const visibleEntries = Object.entries(originalData).filter(
            ([key]) =>
              key !== 'AdjReason' &&
              VISIBLE_COLUMNS.some(v => v.toLowerCase() === key.toLowerCase())
          );
          if (visibleEntries.length === 0) return null;
          return (
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 14,
                padding: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
                gap: 14,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
                Dati Fornitore
              </Text>
              {visibleEntries.map(([key, value]) => (
                <View key={key} style={{ gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {key}
                  </Text>
                  <View
                    style={{
                      backgroundColor: COLORS.surfaceSecondary,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minHeight: 40,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: value ? COLORS.text : COLORS.textTertiary }}>
                      {value || '—'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          );
        })()}

        {/* Dati di Vendita card */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            gap: 14,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
            Dati di Vendita
          </Text>

          <View style={{ gap: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Prezzo di Vendita
            </Text>
            <TextInput
              value={prezzoVendita}
              onChangeText={(v) => {
                console.log('[ItemDetail] prezzoVendita changed:', v);
                setPrezzoVendita(v);
              }}
              placeholder="0,00"
              placeholderTextColor={COLORS.textTertiary}
              keyboardType="decimal-pad"
              style={{
                backgroundColor: COLORS.surfaceSecondary,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: COLORS.border,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                color: COLORS.text,
              }}
            />
          </View>
        </View>

        {/* Extra data section */}
        {extraColumns.length > 0 && (
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 14,
              padding: 16,
              borderWidth: 1,
              borderColor: COLORS.border,
              gap: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
                Dati Aggiuntivi
              </Text>
              <View
                style={{
                  backgroundColor: COLORS.primaryMuted,
                  borderRadius: 6,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontSize: 10, color: COLORS.primary, fontWeight: '600' }}>
                  {extraColumns.length} colonne
                </Text>
              </View>
            </View>
            {extraColumns.map(col => (
              <View key={col} style={{ gap: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {col}
                </Text>
                <TextInput
                  value={String(extraData[col] ?? '')}
                  onChangeText={(v) => {
                    console.log('[ItemDetail] extraData field changed:', col, v);
                    setExtraData(prev => ({ ...prev, [col]: v }));
                  }}
                  placeholder={`Valore per ${col}`}
                  placeholderTextColor={COLORS.textTertiary}
                  style={{
                    backgroundColor: COLORS.surfaceSecondary,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: COLORS.text,
                  }}
                />
              </View>
            ))}
          </View>
        )}

        {/* Processed by + Save */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            gap: 14,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>
              Lavorato da
            </Text>
            <TextInput
              value={processedBy}
              onChangeText={(v) => {
                console.log('[ItemDetail] processedBy changed:', v);
                setProcessedBy(v);
              }}
              placeholder="Nome dipendente"
              placeholderTextColor={COLORS.textTertiary}
              style={{
                backgroundColor: COLORS.surfaceSecondary,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: COLORS.text,
              }}
            />
          </View>

          <AnimatedPressable onPress={handleSave} disabled={saving}>
            <View
              style={{
                backgroundColor: COLORS.primary,
                borderRadius: 12,
                paddingVertical: 15,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <CheckCircle size={18} color="#FFFFFF" />
              )}
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
                {saving ? 'Salvataggio...' : 'Salva Modifiche'}
              </Text>
            </View>
          </AnimatedPressable>
        </View>
      </ScrollView>

      <ToastMessage
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
      />
    </KeyboardAvoidingView>
  );
}
