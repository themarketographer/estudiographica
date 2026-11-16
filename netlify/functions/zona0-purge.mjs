// Borra la copia guardada del timbre (ver bump en lib-zona0/store.js). Es una función de tipo nuevo porque solo esas reciben
// de Netlify el permiso para borrar caché. Solo la llaman las otras funciones de Zona 0, con una clave derivada de la de cocina o personal.
import { purgeCache } from '@netlify/functions';
import crypto from 'node:crypto';

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const clean = (t) => String(t || '').trim();

export default async (req) => {
  const admin = clean(process.env.ZONA0_ADMIN_TOKEN), kitchen = clean(process.env.ZONA0_KITCHEN_TOKEN);
  const secret = admin || kitchen;
  if (req.method !== 'POST' || !secret || req.headers.get('x-z0') !== sha(secret + ':purge')) return new Response('no', { status: 401 });
  const tags = [admin, kitchen].filter(Boolean).map((t) => 'z0ping-' + sha(t).slice(0, 16));
  await purgeCache({ tags });
  return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
};
