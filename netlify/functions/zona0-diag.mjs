// TEMPORAL: ¿las funciones de tipo nuevo reciben el permiso para borrar la caché?
export default async (req, context) => new Response(JSON.stringify({ tok: !!process.env.NETLIFY_PURGE_API_TOKEN, site: !!(context && context.site && context.site.id), v2: true }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
