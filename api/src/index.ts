export interface Env {
    DB: D1Database;
    API_KEY: string;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Auth check
        const apiKey = request.headers.get('X-API-Key');
        if (apiKey !== env.API_KEY) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const url = new URL(request.url);

        if (url.pathname === '/sync' && request.method === 'GET') {
            // Pull all data
            const row = await env.DB.prepare('SELECT * FROM sync_store WHERE id = ?').bind('main').first();
            if (!row) {
                return new Response(JSON.stringify({ incomes: [], expenses: [], personalExpenses: [], debts: [], updatedAt: null }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            return new Response(JSON.stringify({
                incomes: JSON.parse(row.incomes as string),
                expenses: JSON.parse(row.expenses as string),
                personalExpenses: JSON.parse(row.personal_expenses as string),
                debts: JSON.parse(row.debts as string),
                updatedAt: row.updated_at,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (url.pathname === '/sync' && request.method === 'PUT') {
            // Push all data
            const body = await request.json() as {
                incomes: unknown[];
                expenses: unknown[];
                personalExpenses: unknown[];
                debts: unknown[];
            };

            await env.DB.prepare(
                `INSERT INTO sync_store (id, incomes, expenses, personal_expenses, debts, updated_at)
         VALUES ('main', ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           incomes = excluded.incomes,
           expenses = excluded.expenses,
           personal_expenses = excluded.personal_expenses,
           debts = excluded.debts,
           updated_at = excluded.updated_at`
            ).bind(
                JSON.stringify(body.incomes || []),
                JSON.stringify(body.expenses || []),
                JSON.stringify(body.personalExpenses || []),
                JSON.stringify(body.debts || []),
            ).run();

            return new Response(JSON.stringify({ ok: true, updatedAt: new Date().toISOString() }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    },
};
