/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  // 1. CRON JOB: Runs every hour automatically
  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.recordStats(env));
  },

  // 2. HTTP ENDPOINT: Serves data to your frontend chart
  async fetch(request, env, ctx) {
    // Basic CORS so your HTML file can fetch this from localhost or any domain
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Fetch the last 720 hours (30 days) of historical data from Supabase
      const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/wiki_triage_stats?select=created_at,unreviewed_count&order=created_at.desc&limit=720`;
      
      const response = await fetch(supabaseUrl, {
        headers: {
          "apikey": env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      });

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
  },

  // Helper function to handle the fetching and inserting
  async recordStats(env) {
    try {
      // Step A: Fetch current backlog from English Wikipedia
      const wikiRes = await fetch("https://en.wikipedia.org/w/api.php?action=pagetriagestats&namespace=0&format=json");
      const wikiData = await wikiRes.json();
	  
	  const count = wikiData.pagetriagestats.stats.unreviewedarticle.count;

      // Step B: Save directly to Supabase via REST
      await fetch(`${env.SUPABASE_URL}/rest/v1/wiki_triage_stats`, {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal" // Tells Supabase not to send the whole record back
        },
        body: JSON.stringify({ unreviewed_count: count })
      });
    } catch (error) {
      console.error("Cron failed:", error);
    }
  }
};
// satisfies ExportedHandler<Env>;
