// Borra la copia guardada del timbre (ver bump en lib-magma/store.js). Es una función de tipo nuevo porque solo esas reciben
// de Netlify el permiso para borrar caché. Solo la llaman las otras funciones de Magma, con una clave derivada de la del panel.
import { purgeCache } from '@netlify/functions';
import crypto from 'node:crypto';

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const clean = (t) => String(t || '').trim();

export default async (req) => {
  const secret = clean(process.env.MAGMA_ADMIN_TOKEN);
  if (req.method !== 'POST' || !secret || req.headers.get('x-mg') !== sha(secret + ':purge')) return new Response('no', { status: 401 });
  const tags = ['mgping-' + sha(secret).slice(0, 16)];
  await purgeCache({ tags });
  return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
};
