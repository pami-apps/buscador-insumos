// ============================================================
// API: Diagnóstico de tamaño (original + comprimido)
// Endpoint: POST /api/diagnostico
// ============================================================

import { gzipSync } from 'zlib';

const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function validarTokenAdmin(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    if (decoded.type !== 'admin') return false;
    if (decoded.exp < Date.now()) return false;
    return true;
  } catch (e) {
    return false;
  }
}

async function descargarHoja(sheetName, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!${range}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error: ${res.status}`);
  const data = await res.json();
  const values = data.values || [];
  if (values.length
