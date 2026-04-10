const { createClient } = require("@supabase/supabase-js");
const config = require("./config");

const serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const authClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

module.exports = { serviceClient, authClient };
