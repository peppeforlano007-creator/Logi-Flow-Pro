import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Animated,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Wrench, ChevronRight } from 'lucide-react-native';
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
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface FileWithProgress extends SupplierFile {
  total_items: number;
  completed_items: number;
}

export default function LavorazioneScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFiles = useCallback(async () => {
    console.log('[Lavorazione] fetchFiles called');
    try {
      const { data, error } = await db
        .from('supplier_files')
        .select('*, supplier_items(status)')
        .in('status', ['received', 'processing'])
        .order('imported_at', { ascending: false });

      if (error) {
        console.error('[Lavorazione] fetchFiles error:', error);
        throw error;
      }

      console.log('[Lavorazione] fetchFiles success, count:', data?.length);
      const mapped: FileWithProgress[] = (data || []).map((f: any) => {
        const items: { status: string }[] = f.supplier_items ?? [];
        const total_items = items.length;
        const completed_items = items.filter(i => i.status === 'completed').length;
        return { ...f, total_items, completed_items };
      });
      setFiles(mapped);
    } catch (err) {
      console.error('[Lavorazione] fetchFiles exception:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchFiles();
    }, [fetchFiles]),
  );

  const handleRefresh = useCallback(() => {
    console.log('[Lavorazione] handleRefresh called');
    setRefreshing(true);
    fetchFiles();
  }, [fetchFiles]);

  const handleCardPress = useCallback((fileId: string, fileName: string) => {
    console.log('[Lavorazione] handleCardPress', { fileId, fileName });
    router.push(`/file/${fileId}` as any);
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: FileWithProgress; index: number }) => {
    const dateDisplay = formatDate(item.imported_at);
    const progress = item.total_items > 0 ? item.completed_items / item.total_items : 0;
    const progressPercent = Math.round(progress * 100);

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

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <FileStatusBadge status={item.status} />
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] }}>
                {item.completed_items}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                /
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] }}>
                {item.total_items}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                completati
              </Text>
            </View>

            {/* Progress bar */}
            <View style={{ height: 6, backgroundColor: COLORS.surfaceSecondary, borderRadius: 3, overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: progress === 1 ? COLORS.accent : COLORS.primary,
                  borderRadius: 3,
                }}
              />
            </View>
            <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4, textAlign: 'right' }}>
              {progressPercent}%
            </Text>
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
          backgroundColor: 'rgba(124, 58, 237, 0.10)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Wrench size={32} color="#7C3AED" />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8, textAlign: 'center' }}>
        Nessun file in lavorazione
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 }}>
        I file con stato "Ricevuto" o "In Lavorazione" appariranno qui.
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Stack.Screen options={{ title: 'Lavorazione' }} />

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
