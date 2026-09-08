import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Cliente público — só leitura, seguro para qualquer contexto
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente com privilégios totais — usar SOMENTE em rotas de API (backend), nunca no navegador
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)