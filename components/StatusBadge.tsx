import React from 'react';
import { View, Text } from 'react-native';
import {
  COLORS,
  StatusType,
  ItemStatusType,
  getStatusColor,
  getStatusBg,
  getStatusLabel,
  getItemStatusColor,
  getItemStatusBg,
  getItemStatusLabel,
} from '@/constants/AppColors';

interface FileStatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
}

export function FileStatusBadge({ status, size = 'md' }: FileStatusBadgeProps) {
  const color = getStatusColor(status);
  const bg = getStatusBg(status);
  const label = getStatusLabel(status);
  const fontSize = size === 'sm' ? 10 : 11;
  const paddingH = size === 'sm' ? 6 : 8;
  const paddingV = size === 'sm' ? 2 : 3;

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 6,
        paddingHorizontal: paddingH,
        paddingVertical: paddingV,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color,
          fontSize,
          fontWeight: '600',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

interface ItemStatusBadgeProps {
  status: ItemStatusType;
  size?: 'sm' | 'md';
}

export function ItemStatusBadge({ status, size = 'md' }: ItemStatusBadgeProps) {
  const color = getItemStatusColor(status);
  const bg = getItemStatusBg(status);
  const label = getItemStatusLabel(status);
  const fontSize = size === 'sm' ? 10 : 11;
  const paddingH = size === 'sm' ? 6 : 8;
  const paddingV = size === 'sm' ? 2 : 3;

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 6,
        paddingHorizontal: paddingH,
        paddingVertical: paddingV,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color,
          fontSize,
          fontWeight: '600',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

interface FormatBadgeProps {
  format: 'csv' | 'xlsx';
}

export function FormatBadge({ format }: FormatBadgeProps) {
  const isXlsx = format === 'xlsx';
  return (
    <View
      style={{
        backgroundColor: isXlsx ? 'rgba(22, 163, 74, 0.10)' : 'rgba(26, 86, 219, 0.10)',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: isXlsx ? COLORS.accent : COLORS.primary,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        {format}
      </Text>
    </View>
  );
}
