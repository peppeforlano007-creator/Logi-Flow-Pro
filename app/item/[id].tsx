import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, Clock, Camera, ChevronDown, ChevronUp, Search, X } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { ScannerModal } from '@/components/ScannerModal';
import { COLORS } from '@/constants/AppColors';
import { ItemStatusBadge } from '@/components/StatusBadge';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ToastMessage, useToast } from '@/components/ToastMessage';
import { db } from '@/utils/db';
import { useAuth } from '@/contexts/AuthContext';
import type { SupplierItem, SupplierFile } from '@/types';

const CONDITIONS = [
  { label: 'NESSUNA SEGNALAZIONE',  value: 'no issue' },
  { label: 'PRODOTTO NON RICEVUTO', value: 'shortage' },
  { label: 'SCATOLA VUOTA',         value: 'empty box' },
  { label: 'PRODOTTO SBAGLIATO',    value: 'wrong device' },
  { label: 'DISPOSITIVO BLOCCATO',  value: 'cloud locked' },
  { label: 'SCADUTO',               value: 'expired' },
  { label: 'ALTRO',                 value: 'other' },
] as const;

const FIXED_VALUES = CONDITIONS.slice(0, 6).map(c => c.value);

const SELEZIONE_OPTIONS = [
  { value: 'A' as const, label: 'A', description: 'AMAZONPRICE −35%' },
  { value: 'B' as const, label: 'B', description: 'AMAZONPRICE −50%' },
  { value: 'C' as const, label: 'C', description: 'AMAZONPRICE −70%' },
];

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

function getOriginalField(data: Record<string, string>, fieldName: string): string {
  const key = Object.keys(data).find(k => k.toLowerCase() === fieldName.toLowerCase());
  return key ? (data[key] ?? '') : '';
}

function normalizeEAN(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();
  // Detect scientific notation: contains E+ or E- (case insensitive), optionally with comma as decimal
  if (/[eE][+\-]/.test(trimmed)) {
    // Replace comma decimal separator with dot before parsing
    const normalized = trimmed.replace(',', '.');
    const num = parseFloat(normalized);
    if (!isNaN(num)) {
      // Convert to integer string (EANs are always integers)
      return Math.round(num).toString();
    }
  }
  return trimmed;
}

function parseUnitCost(data: Record<string, string>): number | null {
  const key = Object.keys(data).find(k => k.toLowerCase() === 'unitcost');
  if (!key) return null;
  const raw = String(data[key] ?? '').replace(',', '.');
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function parseAmazonPrice(data: Record<string, string>): number | null {
  const key = Object.keys(data).find(k => k.toLowerCase() === 'amazonprice');
  if (!key) return null;
  const raw = String(data[key] ?? '').replace(',', '.');
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function formatPrice(n: number): string {
  return n.toFixed(2); // punto, non virgola
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();
  const { user } = useAuth();

  const [item, setItem] = useState<SupplierItem | null>(null);
  const [file, setFile] = useState<SupplierFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [originalData, setOriginalData] = useState<Record<string, string>>({});
  const [extraData, setExtraData] = useState<Record<string, string>>({});

  // AdjReason condition picker state
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [altroText, setAltroText] = useState('');

  // Selezione state
  const [selezione, setSelezione] = useState<'A' | 'B' | 'C' | null>(null);

  // Prezzo di Vendita state
  const [prezzoVendita, setPrezzoVendita] = useState('');

  // SKU and Lotto state
  const [skuVendita, setSkuVendita] = useState('');
  const [lottoVendita, setLottoVendita] = useState('');

  // EAN Corretto and ASIN Corretto state
  const [eanCorretto, setEanCorretto] = useState('');
  const [asinCorretto, setAsinCorretto] = useState('');

  // Scanner state
  const [scanTarget, setScanTarget] = useState<'sku' | 'lotto' | null>(null);

  // Dati Fornitore collapsible state
  const [datiFornitoreOpen, setDatiFornitoreOpen] = useState(false);

  // Web search modal state
  const [webSearchVisible, setWebSearchVisible] = useState(false);

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

      // Restore SKU and Lotto from extraData
      setSkuVendita(fetchedItem.extra_data?.['SKU'] ?? '');
      setLottoVendita(fetchedItem.extra_data?.['Lotto'] ?? '');
      console.log('[ItemDetail] restoring SKU:', fetchedItem.extra_data?.['SKU'], 'Lotto:', fetchedItem.extra_data?.['Lotto']);

      // EAN Corretto: restore from extraData if saved, otherwise pull from originalData
      const savedEan = (fetchedItem.extra_data?.['EANCorretto'] ?? '');
      setEanCorretto(savedEan !== '' ? savedEan : normalizeEAN(getOriginalField(fetchedItem.original_data ?? {}, 'EAN')));

      const savedAsin = (fetchedItem.extra_data?.['ASINCorretto'] ?? '');
      setAsinCorretto(savedAsin !== '' ? savedAsin : getOriginalField(fetchedItem.original_data ?? {}, 'ASIN'));

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
        setSkuVendita(currentExtra['SKU'] ?? '');
        setLottoVendita(currentExtra['Lotto'] ?? '');
        setPrezzoVendita(currentExtra['PrezzoVendita'] ?? '');

        const savedEan2 = currentExtra['EANCorretto'] ?? '';
        setEanCorretto(savedEan2 !== '' ? savedEan2 : normalizeEAN(getOriginalField(fetchedItem.original_data ?? {}, 'EAN')));

        const savedAsin2 = currentExtra['ASINCorretto'] ?? '';
        setAsinCorretto(savedAsin2 !== '' ? savedAsin2 : getOriginalField(fetchedItem.original_data ?? {}, 'ASIN'));
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
    const amazonPrice = parseAmazonPrice(originalData);

    if (selezione === null) {
      setPrezzoVendita('');
    } else if (amazonPrice === null) {
      setPrezzoVendita('');
    } else if (selezione === 'A') {
      setPrezzoVendita(formatPrice(amazonPrice * 0.65));
    } else if (selezione === 'B') {
      setPrezzoVendita(formatPrice(amazonPrice * 0.50));
    } else if (selezione === 'C') {
      setPrezzoVendita(formatPrice(amazonPrice * 0.30));
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
    console.log('[ItemDetail] handleSave called', { id, processedBy: user?.username ?? '', selectedCondition, altroText, selezione, prezzoVendita });
    setSaving(true);
    try {
      // Compute final AdjReason value
      let adjReason = '';
      if (selectedCondition === null || selectedCondition === 'no issue') {
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
        SKU: skuVendita,
        Lotto: lottoVendita,
        EANCorretto: eanCorretto,
        ASINCorretto: asinCorretto,
      };
      console.log('[ItemDetail] saving extraData:', { Selezione: updatedExtraData.Selezione, PrezzoVendita: updatedExtraData.PrezzoVendita, SKU: updatedExtraData.SKU, Lotto: updatedExtraData.Lotto, EANCorretto: updatedExtraData.EANCorretto, ASINCorretto: updatedExtraData.ASINCorretto });

      const { error } = await db
        .from('supplier_items')
        .update({
          original_data: updatedOriginalData,
          extra_data: updatedExtraData,
          status: 'completed',
          processed_at: new Date().toISOString(),
          processed_by: user?.username || null,
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
  }, [id, originalData, extraData, user, selectedCondition, altroText, selezione, prezzoVendita, skuVendita, lottoVendita, eanCorretto, asinCorretto, showToast, router]);

  const itemDesc = getOriginalField(originalData, 'ITEMDESC');
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(itemDesc + ' prezzo')}`;

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

          {SELEZIONE_OPTIONS.map((opt, index) => {
            const isSelected = selezione === opt.value;
            const isLast = index === SELEZIONE_OPTIONS.length - 1;

            return (
              <AnimatedPressable
                key={opt.value}
                onPress={() => handleSelezionePress(opt.value)}
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

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>{opt.label}</Text>
                    <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{opt.description}</Text>
                  </View>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>

        {/* Original data section — collapsible */}
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
                borderWidth: 1,
                borderColor: COLORS.border,
                overflow: 'hidden',
              }}
            >
              {/* Header — tappable to toggle */}
              <AnimatedPressable onPress={() => {
                console.log('[DatiFornitore] toggle pressed, opening:', !datiFornitoreOpen);
                setDatiFornitoreOpen(prev => !prev);
              }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
                    Dati Fornitore
                  </Text>
                  {datiFornitoreOpen
                    ? <ChevronUp size={18} color={COLORS.textSecondary} />
                    : <ChevronDown size={18} color={COLORS.textSecondary} />}
                </View>
              </AnimatedPressable>

              {/* Collapsible content */}
              {datiFornitoreOpen && (
                <View style={{
                  paddingHorizontal: 16,
                  paddingBottom: 16,
                  gap: 14,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                }}>
                  {visibleEntries.map(([key, value]) => (
                    <View key={key} style={{ gap: 4, marginTop: 14 }}>
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
              )}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={prezzoVendita}
                onChangeText={(v) => {
                  console.log('[ItemDetail] prezzoVendita changed:', v);
                  setPrezzoVendita(v);
                }}
                placeholder="0.00"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
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
              <AnimatedPressable
                onPress={() => {
                  console.log('[ItemDetail] web search pressed, itemDesc:', itemDesc);
                  setWebSearchVisible(true);
                }}
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: 10,
                  padding: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Search size={18} color="#fff" />
              </AnimatedPressable>
            </View>
          </View>

          {/* EAN Corretto */}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              EAN Corretto
            </Text>
            <TextInput
              value={eanCorretto}
              onChangeText={(v) => {
                console.log('[ItemDetail] eanCorretto changed:', v);
                setEanCorretto(v);
              }}
              placeholder="EAN corretto"
              placeholderTextColor={COLORS.textTertiary}
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

          {/* ASIN Corretto */}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              ASIN Corretto
            </Text>
            <TextInput
              value={asinCorretto}
              onChangeText={(v) => {
                console.log('[ItemDetail] asinCorretto changed:', v);
                setAsinCorretto(v);
              }}
              placeholder="ASIN corretto"
              placeholderTextColor={COLORS.textTertiary}
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

          {/* SKU */}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              SKU
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={skuVendita}
                onChangeText={(v) => {
                  console.log('[ItemDetail] skuVendita changed:', v);
                  setSkuVendita(v);
                }}
                placeholder="Inserisci SKU"
                placeholderTextColor={COLORS.textTertiary}
                style={{
                  flex: 1,
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
              <AnimatedPressable onPress={() => {
                console.log('[ItemDetail] scan SKU button pressed');
                setScanTarget('sku');
              }}>
                <View style={{
                  width: 42, height: 42,
                  borderRadius: 10,
                  backgroundColor: COLORS.primaryMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Camera size={20} color={COLORS.primary} />
                </View>
              </AnimatedPressable>
            </View>
          </View>

          {/* LOTTO */}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              LOTTO
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={lottoVendita}
                onChangeText={(v) => {
                  console.log('[ItemDetail] lottoVendita changed:', v);
                  setLottoVendita(v);
                }}
                placeholder="Inserisci lotto"
                placeholderTextColor={COLORS.textTertiary}
                style={{
                  flex: 1,
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
              <AnimatedPressable onPress={() => {
                console.log('[ItemDetail] scan LOTTO button pressed');
                setScanTarget('lotto');
              }}>
                <View style={{
                  width: 42, height: 42,
                  borderRadius: 10,
                  backgroundColor: COLORS.primaryMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Camera size={20} color={COLORS.primary} />
                </View>
              </AnimatedPressable>
            </View>
          </View>
        </View>

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
            <View
              style={{
                backgroundColor: COLORS.surfaceSecondary,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontSize: 15, color: COLORS.text, fontWeight: '600' }}>
                {user?.username ?? '—'}
              </Text>
            </View>
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

      <ScannerModal
        visible={scanTarget !== null}
        onClose={() => setScanTarget(null)}
        onScanned={(code) => {
          console.log('[ItemDetail] barcode scanned:', code, 'target:', scanTarget);
          if (scanTarget === 'sku') setSkuVendita(code);
          else if (scanTarget === 'lotto') setLottoVendita(code);
          setScanTarget(null);
        }}
        hint={scanTarget === 'sku' ? 'Scansiona barcode SKU' : 'Scansiona barcode LOTTO'}
      />

      {/* WebView Search Modal */}
      <Modal
        visible={webSearchVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          console.log('[ItemDetail] webSearch modal closed');
          setWebSearchVisible(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 }} numberOfLines={1}>
              {itemDesc || 'Ricerca prezzo'}
            </Text>
            <AnimatedPressable
              onPress={() => {
                console.log('[ItemDetail] webSearch modal close button pressed');
                setWebSearchVisible(false);
              }}
              style={{ padding: 4 }}
            >
              <X size={22} color={COLORS.textSecondary} />
            </AnimatedPressable>
          </View>
          {/* WebView */}
          <WebView
            source={{ uri: googleSearchUrl }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
