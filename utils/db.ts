/**
 * Typed database helper.
 * The generated Supabase types don't yet include our tables,
 * so we cast the client to `any` here and re-export typed helpers.
 */
import { supabase } from '@/app/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;
