const { createClient } = require("@supabase/supabase-js");
const config = require("./config");

let serviceClient = null;
let authClient = null;

if (!config.useLocalMode) {
  serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  authClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

module.exports = { serviceClient, authClient };
