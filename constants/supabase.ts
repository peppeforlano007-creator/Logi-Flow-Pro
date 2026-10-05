import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

// Public Supabase project config — read from app.json extra at runtime
export const SUPABASE_PROJECT_URL: string = extra.supabaseUrl ?? '';
export const SUPABASE_ANON_TOKEN: string = extra.supabaseAnonToken ?? '';
