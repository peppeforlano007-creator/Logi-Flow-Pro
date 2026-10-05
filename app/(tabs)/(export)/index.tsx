import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Animated,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Download, FileText } from 'lucide-react-native';
import { COLORS } from '@/constants/AppColors';
import { FileStatusBadge, FormatBadge } from '@/components/StatusBadge';
import { SkeletonList } from '@/components/SkeletonLoader';
import { ToastMessage, useToast } from '@/components/ToastMessage';
import { db } from '@/utils/db';
import { saveAndShareFile } from '@/utils/fileHelpers';
import type { SupplierFile } from '@/types';

const SUPABASE_URL = 'https://qblqwlponnpqragrkncl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFibHF3bHBvbm5wcXJhZ3JrbmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNDY1NDEsImV4cCI6MjEwNjYyMjU0MX0.s6mofR39cPu9bFI1p-xfHNf4f176n-0L6Y8g86DvP0s';

function AnimatedListItem({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface FileWithProgress extends SupplierFile {
  total_items: number;
  completed_items: number;
}

export default function ExportScreen() {
  const { toast, showToast, hideToast } = useToast();
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    console.log('[Export] fetchFiles called');
    try {
      const { data, error } = await db
        .from('supplier_files')
        .select('*, supplier_items(status)')
        .order('imported_at', { ascending: false });

      if (error) {
        console.error('[Export] fetchFiles error:', error);
        throw error;
      }

      console.log('[Export] fetchFiles success, count:', data?.length);
      const mapped: FileWithProgress[] = (data || []).map((f: any) => {
        const items: { status: string }[] = f.supplier_items ?? [];
        return {
          ...f,
          total_items: items.length,
          completed_items: items.filter(i => i.status === 'completed').length,
        };
      });
      setFiles(mapped);
    } catch (err) {
      console.error('[Export] fetchFiles exception:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchFiles();
    }, [fetchFiles])
  );

  const handleRefresh = useCallback(() => {
    console.log('[Export] handleRefresh called');
    setRefreshing(true);
    fetchFiles();
  }, [fetchFiles]);

  const handleExport = useCallback(async (file: FileWithProgress) => {
    console.log('[Export] handleExport called', { fileId: file.id, fileName: file.file_name });
    setExportingId(file.id);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/export-supplier-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ file_id: file.id }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[Export] export-supplier-file error:', response.status, text);
        throw new Error(`Errore esportazione: ${response.status}`);
      }

      const data = await response.json();
      console.log('[Export] export-supplier-file success, fileName:', data.file_name);

      await saveAndShareFile(data.file_base64, data.file_name ?? file.file_name);
      showToast(`File esportato: ${data.file_name ?? file.file_name}`, 'success');
    } catch (err: any) {
      console.error('[Export] handleExport error:', err);
      showToast(err?.message ?? 'Errore durante l\'esportazione', 'error');
    } finally {
      setExportingId(null);
    }
  }, [showToast]);

  const renderItem = useCallback(({ item, index }: { item: FileWithProgress; index: number }) => {
    const dateDisplay = formatDate(item.imported_at);
    const isExporting = exportingId === item.id;
    const progress = item.total_items > 0 ? item.completed_items / item.total_items : 0;
    const progressPercent = Math.round(progress * 100);

    return (
      <AnimatedListItem index={index}>
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 14,
            padding: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={{ fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 2 }}
                numberOfLines={1}
              >
                {item.file_name}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                {dateDisplay}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                console.log('[Export] Esporta button pressed, fileId:', item.id);
                handleExport(item);
              }}
              disabled={isExporting}
              activeOpacity={0.75}
              style={{
                backgroundColor: isExporting ? COLORS.accent + 'AA' : COLORS.accent,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minWidth: 90,
                justifyContent: 'center',
              }}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Download size={15} color="#FFFFFF" />
              )}
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
                {isExporting ? '...' : 'Esporta'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <FormatBadge format={item.original_format} />
            <FileStatusBadge status={item.status} />
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FileText size={13} color={COLORS.textSecondary} />
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] }}>
                {item.completed_items}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                /
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] }}>
                {item.total_items}
              </Text>
            </View>
          </View>

          {item.total_items > 0 && (
            <View style={{ height: 4, backgroundColor: COLORS.surfaceSecondary, borderRadius: 2, overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: progress === 1 ? COLORS.accent : COLORS.primary,
                  borderRadius: 2,
                }}
              />
            </View>
          )}
        </View>
      </AnimatedListItem>
    );
  }, [exportingId, handleExport]);

  const emptyState = (
    <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          backgroundColor: COLORS.accentMuted,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Download size={32} color={COLORS.accent} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8, textAlign: 'center' }}>
        Nessun file disponibile
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 }}>
        Importa e lavora i file per poi esportarli.
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Stack.Screen options={{ title: 'Export' }} />

      {loading ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        >
          <SkeletonList count={4} />
        </ScrollView>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 120, flexGrow: 1 }}
          ListEmptyComponent={emptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
        />
      )}

      <ToastMessage
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
      />
    </View>
  );
}
