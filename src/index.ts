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
		const url = new URL(request.url);

		// Isolate the API logic to a specific route
		if (url.pathname === '/api/history') {
			const corsHeaders = {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			};

			if (request.method === 'OPTIONS') {
				return new Response(null, { headers: corsHeaders });
			}

			try {
				const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/wiki_triage_stats?select=created_at,unreviewed_count,reviewed_count&order=created_at.desc&limit=720`;
				const response = await fetch(supabaseUrl, {
					headers: {
						apikey: env.SUPABASE_SERVICE_KEY,
						Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
					},
				});

				const data = await response.json();

				return new Response(JSON.stringify(data), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			} catch (error) {
				return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
			}
		}

		// Fallback: If it's not the API route, let Cloudflare serve your static assets (public/index.html)
		// Note: In older Wrangler versions you'd explicitly return env.ASSETS.fetch(request).
		// In newer versions, simply returning a 404 or ignoring the route lets Cloudflare automatically serve the static asset.
		return new Response('Not Found', { status: 404 });
	},

	// Helper function to handle the fetching and inserting
	async recordStats(env) {
		try {
			// Step A: Fetch current backlog from English Wikipedia
			const wikiRes = await fetch('https://en.wikipedia.org/w/api.php?action=pagetriagestats&namespace=0&format=json', {
				headers: {
					'User-Agent': env.WIKI_USER_AGENT,
				},
			});
			// console.log(await wikiRes.text());
			const wikiData = await wikiRes.json();

			const unreviewedCount = wikiData.pagetriagestats?.stats?.unreviewedarticle?.count || 0;
			const reviewedCount = wikiData.pagetriagestats?.stats?.reviewedarticle?.reviewed_count || 0;

			// Step B: Save directly to Supabase via REST
			await fetch(`${env.SUPABASE_URL}/rest/v1/wiki_triage_stats`, {
				method: 'POST',
				headers: {
					apikey: env.SUPABASE_SERVICE_KEY,
					Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
					'Content-Type': 'application/json',
					Prefer: 'return=minimal', // Tells Supabase not to send the whole record back
				},
				body: JSON.stringify({
					unreviewed_count: unreviewedCount,
					reviewed_count: reviewedCount,
				}),
			});
		} catch (error) {
			console.error('Cron failed:', error);
		}
	},
};
// satisfies ExportedHandler<Env>;
