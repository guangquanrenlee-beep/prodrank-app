import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://reqacknemyxnyqzkvrpe.supabase.co";
const supabaseAnonKey = "sb_publishable_yr6jYKYiMfTqTcaYZfzLhg_Rb-NYk4n";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
