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
import { Box, Plus, CheckCircle, Clock } from 'lucide-react-native';
import { COLORS } from '@/constants/AppColors';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ToastMessage, useToast } from '@/components/ToastMessage';
import { db } from '@/utils/db';
import type { SupplierFile, ReceptionLog } from '@/types';

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

export default function ReceptionScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();

  const [file, setFile] = useState<SupplierFile | null>(null);
  const [logs, setLogs] = useState<ReceptionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);

  const [boxesReceived, setBoxesReceived] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');

  const fetchData = useCallback(async () => {
    console.log('[Reception] fetchData called', { fileId });
    try {
      const [fileRes, logsRes] = await Promise.all([
        db.from('supplier_files').select('*').eq('id', fileId).single(),
        db
          .from('reception_logs')
          .select('*')
          .eq('file_id', fileId)
          .order('received_at', { ascending: false }),
      ]);

      if (fileRes.error) {
        console.error('[Reception] file fetch error:', fileRes.error);
        throw fileRes.error;
      }
      if (logsRes.error) {
        console.error('[Reception] logs fetch error:', logsRes.error);
        throw logsRes.error;
      }

      console.log('[Reception] fetchData success, logs:', logsRes.data?.length);
      setFile(fileRes.data as SupplierFile);
      setLogs((logsRes.data ?? []) as ReceptionLog[]);
    } catch (err) {
      console.error('[Reception] fetchData exception:', err);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveReception = useCallback(async () => {
    const boxes = parseInt(boxesReceived, 10);
    if (!boxes || boxes <= 0) {
      showToast('Inserisci un numero valido di scatole', 'error');
      return;
    }
    console.log('[Reception] handleSaveReception called', { fileId, boxes, receivedBy, notes });

    setSaving(true);
    try {
      const { error: logError } = await db.from('reception_logs').insert({
        file_id: fileId,
        boxes_received: boxes,
        received_by: receivedBy || null,
        notes: notes || null,
      });

      if (logError) {
        console.error('[Reception] insert log error:', logError);
        throw logError;
      }

      // Update file status to 'receiving' if it was 'imported'
      if (file?.status === 'imported') {
        console.log('[Reception] Updating file status to receiving');
        const { error: updateError } = await db
          .from('supplier_files')
          .update({ status: 'receiving' })
          .eq('id', fileId);

        if (updateError) {
          console.error('[Reception] update status error:', updateError);
        }
      }

      setBoxesReceived('');
      setReceivedBy('');
      setNotes('');
      showToast('Ricezione registrata con successo', 'success');
      fetchData();
    } catch (err: any) {
      console.error('[Reception] handleSaveReception error:', err);
      showToast(err?.message ?? 'Errore durante il salvataggio', 'error');
    } finally {
      setSaving(false);
    }
  }, [fileId, boxesReceived, receivedBy, notes, file, fetchData, showToast]);

  const handleMarkComplete = useCallback(async () => {
    console.log('[Reception] handleMarkComplete called', { fileId });
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
      fetchData();
      setTimeout(() => router.back(), 1500);
    } catch (err: any) {
      console.error('[Reception] handleMarkComplete error:', err);
      showToast(err?.message ?? 'Errore', 'error');
    } finally {
      setMarkingComplete(false);
    }
  }, [fileId, fetchData, showToast, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const totalBoxes = logs.reduce((sum, l) => sum + (l.boxes_received ?? 0), 0);
  const isAlreadyReceived = file?.status === 'received';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        {/* Summary card */}
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
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: COLORS.primaryMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box size={24} color={COLORS.primary} />
          </View>
          <View>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 2 }}>
              Totale scatole ricevute
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: COLORS.text, fontVariant: ['tabular-nums'] }}>
              {totalBoxes}
            </Text>
          </View>
        </View>

        {/* Reception history */}
        {logs.length > 0 && (
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 }}>
              Storico Ricezioni
            </Text>
            <View style={{ gap: 8 }}>
              {logs.map((log) => {
                const logDate = formatDate(log.received_at);
                return (
                  <View
                    key={log.id}
                    style={{
                      backgroundColor: COLORS.surface,
                      borderRadius: 12,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: COLORS.accentMuted,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2,
                      }}
                    >
                      <Clock size={16} color={COLORS.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'] }}>
                          {log.boxes_received} scatole
                        </Text>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                          {logDate}
                        </Text>
                      </View>
                      {log.received_by ? (
                        <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                          da {log.received_by}
                        </Text>
                      ) : null}
                      {log.notes ? (
                        <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                          {log.notes}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Form */}
        {!isAlreadyReceived && (
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
              Registra Ricezione
            </Text>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>
                Numero scatole ricevute *
              </Text>
              <TextInput
                value={boxesReceived}
                onChangeText={(v) => {
                  console.log('[Reception] boxesReceived changed:', v);
                  setBoxesReceived(v);
                }}
                placeholder="es. 12"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="numeric"
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

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>
                Ricevuto da
              </Text>
              <TextInput
                value={receivedBy}
                onChangeText={(v) => {
                  console.log('[Reception] receivedBy changed:', v);
                  setReceivedBy(v);
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

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>
                Note (opzionale)
              </Text>
              <TextInput
                value={notes}
                onChangeText={(v) => {
                  console.log('[Reception] notes changed:', v);
                  setNotes(v);
                }}
                placeholder="Eventuali note sulla ricezione..."
                placeholderTextColor={COLORS.textTertiary}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: COLORS.surfaceSecondary,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: COLORS.text,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />
            </View>

            <AnimatedPressable onPress={handleSaveReception} disabled={saving}>
              <View
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Plus size={18} color="#FFFFFF" />
                )}
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
                  {saving ? 'Salvataggio...' : 'Registra Ricezione'}
                </Text>
              </View>
            </AnimatedPressable>
          </View>
        )}

        {/* Mark complete button */}
        {!isAlreadyReceived && (
          <AnimatedPressable onPress={handleMarkComplete} disabled={markingComplete}>
            <View
              style={{
                backgroundColor: COLORS.accentMuted,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                borderWidth: 1,
                borderColor: COLORS.accent,
              }}
            >
              {markingComplete ? (
                <ActivityIndicator color={COLORS.accent} size="small" />
              ) : (
                <CheckCircle size={18} color={COLORS.accent} />
              )}
              <Text style={{ color: COLORS.accent, fontSize: 15, fontWeight: '700' }}>
                {markingComplete ? 'Aggiornamento...' : 'Segna come Ricevuto Completamente'}
              </Text>
            </View>
          </AnimatedPressable>
        )}

        {isAlreadyReceived && (
          <View
            style={{
              backgroundColor: COLORS.accentMuted,
              borderRadius: 12,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <CheckCircle size={20} color={COLORS.accent} />
            <Text style={{ color: COLORS.accent, fontSize: 14, fontWeight: '600' }}>
              File ricevuto completamente
            </Text>
          </View>
        )}
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
