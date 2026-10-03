import React, { useState, useEffect, useCallback } from 'react';
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
import { Save, CheckCircle, Clock } from 'lucide-react-native';
import { COLORS } from '@/constants/AppColors';
import { ItemStatusBadge } from '@/components/StatusBadge';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ToastMessage, useToast } from '@/components/ToastMessage';
import { db } from '@/utils/db';
import type { SupplierItem, SupplierFile } from '@/types';

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

      const item = itemData as SupplierItem;
      console.log('[ItemDetail] item fetched:', item.item_code);
      setItem(item);
      setOriginalData({ ...(item.original_data ?? {}) });
      setExtraData({ ...(item.extra_data ?? {}) });
      if (item.processed_by) setProcessedBy(item.processed_by);

      // Fetch file for extra_columns
      const { data: fileData, error: fileError } = await db
        .from('supplier_files')
        .select('*')
        .eq('id', item.file_id)
        .single();

      if (!fileError && fileData) {
        console.log('[ItemDetail] file fetched:', fileData.file_name);
        setFile(fileData as SupplierFile);
        // Initialize extra_data with empty strings for any missing extra columns
        const extraCols: string[] = fileData.extra_columns ?? [];
        const currentExtra = { ...(item.extra_data ?? {}) };
        extraCols.forEach(col => {
          if (!(col in currentExtra)) currentExtra[col] = '';
        });
        setExtraData(currentExtra);
      }
    } catch (err) {
      console.error('[ItemDetail] fetchData exception:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = useCallback(async () => {
    console.log('[ItemDetail] handleSave called', { id, processedBy });
    setSaving(true);
    try {
      const { error } = await db
        .from('supplier_items')
        .update({
          original_data: originalData,
          extra_data: extraData,
          status: 'completed',
          processed_at: new Date().toISOString(),
          processed_by: processedBy || null,
        })
        .eq('id', id);

      if (error) {
        console.error('[ItemDetail] save error:', error);
        throw error;
      }

      console.log('[ItemDetail] item saved successfully');
      showToast('Articolo salvato con successo', 'success');
      setTimeout(() => router.back(), 1200);
    } catch (err: any) {
      console.error('[ItemDetail] handleSave error:', err);
      showToast(err?.message ?? 'Errore durante il salvataggio', 'error');
    } finally {
      setSaving(false);
    }
  }, [id, originalData, extraData, processedBy, showToast, router]);

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

        {/* Original data section */}
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
          {Object.entries(originalData).map(([key, value]) => (
            <View key={key} style={{ gap: 5 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {key}
              </Text>
              <TextInput
                value={String(value ?? '')}
                onChangeText={(v) => {
                  console.log('[ItemDetail] originalData field changed:', key, v);
                  setOriginalData(prev => ({ ...prev, [key]: v }));
                }}
                placeholder={`Valore per ${key}`}
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
