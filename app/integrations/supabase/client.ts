import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './types';
import { createClient } from '@supabase/supabase-js'

import { SUPABASE_PROJECT_URL, SUPABASE_ANON_TOKEN } from '@/constants/supabase';
export const SUPABASE_URL = SUPABASE_PROJECT_URL;
export const SUPABASE_PUBLISHABLE_KEY = SUPABASE_ANON_TOKEN;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
