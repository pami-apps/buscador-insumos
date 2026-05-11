// ============================================================
// API: Diagnóstico de tamaño de datos
// Endpoint: POST /api/diagnostico
// ============================================================

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
  if (values.length === 0) return [];
  const headers = values[0];
  const rows = values.slice(1);
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] || '';
    });
    return obj;
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (!token || !validarTokenAdmin(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  try {
    const vias = await descargarHoja('VIAS DE EXCEPCION', 'A:R');
    const alt = await descargarHoja('ALTERNATIVOS', 'A:Z');
    
    const viasFiltradas = vias.filter(r => 
      Object.values(r).some(v => v && v.toString().trim().length > 0)
    );
    const altFiltrados = alt.filter(r => 
      Object.values(r).some(v => v && v.toString().trim().length > 0)
    );
    
    const datos = {
      vias: viasFiltradas,
      alt: altFiltrados,
    };
    
    const json = JSON.stringify(datos);
    const sizeBytes = Buffer.byteLength(json, 'utf-8');
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
    const sizeKB = (sizeBytes / 1024).toFixed(2);
    
    return res.status(200).json({
      success: true,
      stats: {
        vias_count: viasFiltradas.length,
        alt_count: altFiltrados.length,
        total_records: viasFiltradas.length + altFiltrados.length,
        size_bytes: sizeBytes,
        size_kb: sizeKB,
        size_mb: sizeMB,
      },
      muestra_via: viasFiltradas[0] || null,
      muestra_alt: altFiltrados[0] || null,
    });
    
  } catch (error) {
    return res.status(500).json({
      error: 'Error en diagnóstico',
      details: error.message,
    });
  }
}
