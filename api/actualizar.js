// ============================================================
// API: Actualizar datos (solo admin)
// Endpoint: POST /api/actualizar
// ============================================================
// Este endpoint:
// 1. Valida el JWT de admin
// 2. Descarga datos del Google Sheet (con API Key del backend)
// 3. Sube data.json a GitHub (con token del backend)
// NUNCA expone las credenciales al frontend.
// ============================================================

const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;
const FILE_PATH = 'public/data.json';

// ------------------------------------------------------------
// Validar el JWT del admin
// ------------------------------------------------------------
function validarTokenAdmin(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    
    // Verificar que sea admin
    if (decoded.type !== 'admin') return false;
    
    // Verificar que no haya expirado
    if (decoded.exp < Date.now()) return false;
    
    return true;
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------------
// Descargar una hoja del Google Sheet
// ------------------------------------------------------------
async function descargarHoja(sheetName, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!${range}?key=${GOOGLE_API_KEY}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Error al leer Sheet "${sheetName}": ${res.status}`);
  }
  
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

// ------------------------------------------------------------
// Subir data.json a GitHub
// ------------------------------------------------------------
async function subirAGitHub(data) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  
  // 1. Obtener SHA del archivo actual
  let sha = null;
  const getRes = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    }
  });
  
  if (getRes.ok) {
    const fileData = await getRes.json();
    sha = fileData.sha;
  } else if (getRes.status !== 404) {
    throw new Error(`Error al leer archivo existente: ${getRes.status}`);
  }
  
  // 2. Convertir a base64
  const json = JSON.stringify({ ...data, updatedAt: new Date().toISOString() });
  const base64 = Buffer.from(json, 'utf-8').toString('base64');
  
  // 3. Subir
  const body = {
    message: `Actualización de datos: ${new Date().toLocaleString('es-AR')}`,
    content: base64,
    ...(sha ? { sha } : {}),
  };
  
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(`Error al subir: ${putRes.status} - ${err.message || ''}`);
  }
  
  return true;
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
export default async function handler(req, res) {
  // Solo acepta POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  
  // Validar token admin
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (!token || !validarTokenAdmin(token)) {
    return res.status(401).json({ error: 'No autorizado o token expirado' });
  }
  
  try {
    // 1. Descargar datos del Sheet
    const vias = await descargarHoja('VIAS DE EXCEPCION', 'A:R');
    const alt = await descargarHoja('ALTERNATIVOS', 'A:Z');
    
    // 2. Filtrar registros con datos válidos
    const viasFiltradas = vias.filter(r => 
      r['Nombre'] || r['NOMBRE'] || r['nombre'] || 
      Object.values(r).some(v => v && v.toString().trim().length > 0)
    );
    const altFiltrados = alt.filter(r => 
      r['Nombre'] || r['NOMBRE'] || r['nombre'] || 
      Object.values(r).some(v => v && v.toString().trim().length > 0)
    );
    
    const datos = {
      vias: viasFiltradas,
      alt: altFiltrados,
    };
    
    // 3. Subir a GitHub
    await subirAGitHub(datos);
    
    return res.status(200).json({
      success: true,
      message: 'Datos actualizados correctamente',
      stats: {
        vias: viasFiltradas.length,
        alt: altFiltrados.length,
      }
    });
    
  } catch (error) {
    console.error('Error en actualizar:', error);
    return res.status(500).json({
      error: 'Error al actualizar datos',
      details: error.message,
    });
  }
}
