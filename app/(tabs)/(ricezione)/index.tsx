import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Animated,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Package, ChevronRight, Box } from 'lucide-react-native';
import { COLORS } from '@/constants/AppColors';
import { FileStatusBadge } from '@/components/StatusBadge';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { SkeletonList } from '@/components/SkeletonLoader';
import { db } from '@/utils/db';
import type { SupplierFile } from '@/types';

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
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface FileWithBoxes extends SupplierFile {
  total_boxes: number;
}

export default function RicezioneScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<FileWithBoxes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFiles = useCallback(async () => {
    console.log('[Ricezione] fetchFiles called');
    try {
      const { data, error } = await db
        .from('supplier_files')
        .select('*, reception_logs(boxes_received)')
        .neq('status', 'completed')
        .order('imported_at', { ascending: false });

      if (error) {
        console.error('[Ricezione] fetchFiles error:', error);
        throw error;
      }

      console.log('[Ricezione] fetchFiles success, count:', data?.length);
      const mapped: FileWithBoxes[] = (data || []).map((f: any) => {
        const logs: { boxes_received: number }[] = f.reception_logs ?? [];
        const total_boxes = logs.reduce((sum, l) => sum + (l.boxes_received ?? 0), 0);
        return { ...f, total_boxes };
      });
      setFiles(mapped);
    } catch (err) {
      console.error('[Ricezione] fetchFiles exception:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleRefresh = useCallback(() => {
    console.log('[Ricezione] handleRefresh called');
    setRefreshing(true);
    fetchFiles();
  }, [fetchFiles]);

  const handleCardPress = useCallback((fileId: string, fileName: string) => {
    console.log('[Ricezione] handleCardPress', { fileId, fileName });
    router.push(`/reception/${fileId}` as any);
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: FileWithBoxes; index: number }) => {
    const dateDisplay = formatDate(item.imported_at);

    return (
      <AnimatedListItem index={index}>
        <AnimatedPressable onPress={() => handleCardPress(item.id, item.file_name)}>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
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
              <ChevronRight size={18} color={COLORS.textTertiary} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FileStatusBadge status={item.status} />
              <View style={{ flex: 1 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Box size={13} color={COLORS.textSecondary} />
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] }}>
                  {item.total_boxes}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                  scatole ricevute
                </Text>
              </View>
            </View>
          </View>
        </AnimatedPressable>
      </AnimatedListItem>
    );
  }, [handleCardPress]);

  const emptyState = (
    <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          backgroundColor: COLORS.warningMuted,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Package size={32} color={COLORS.warning} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8, textAlign: 'center' }}>
        Nessun file in ricezione
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 }}>
        I file non ancora completati appariranno qui.
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Stack.Screen options={{ title: 'Ricezione' }} />

      {loading ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        >
          <SkeletonList count={3} />
        </ScrollView>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 16, paddingBottom: 120, flexGrow: 1 }}
          ListEmptyComponent={emptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
        />
      )}
    </View>
  );
}
