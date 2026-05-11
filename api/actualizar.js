// ============================================================
// API: Actualizar datos (solo admin)
// Endpoint: POST /api/actualizar
// ============================================================
// Este endpoint:
// 1. Valida el JWT de admin
// 2. Descarga datos del Google Sheet (con API Key del backend)
// 3. Sube data.json a GitHub usando Git Data API (sin límite de 1MB)
// NUNCA expone las credenciales al frontend.
// ============================================================

const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;
const FILE_PATH = 'public/data.json';
const BRANCH = 'main';

// ------------------------------------------------------------
// Validar el JWT del admin
// ------------------------------------------------------------
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
// Subir a GitHub usando Git Data API (soporta archivos > 1MB)
// ------------------------------------------------------------
async function subirAGitHubGitData(data) {
  const baseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  
  // 1. Obtener SHA del último commit en la rama
  const refRes = await fetch(`${baseUrl}/git/refs/heads/${BRANCH}`, { headers });
  if (!refRes.ok) throw new Error(`Error al obtener ref: ${refRes.status}`);
  const refData = await refRes.json();
  const latestCommitSha = refData.object.sha;
  
  // 2. Obtener el tree del último commit
  const commitRes = await fetch(`${baseUrl}/git/commits/${latestCommitSha}`, { headers });
  if (!commitRes.ok) throw new Error(`Error al obtener commit: ${commitRes.status}`);
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;
  
  // 3. Crear un blob con el contenido nuevo
  const json = JSON.stringify({ ...data, updatedAt: new Date().toISOString() });
  const blobRes = await fetch(`${baseUrl}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: Buffer.from(json, 'utf-8').toString('base64'),
      encoding: 'base64',
    }),
  });
  if (!blobRes.ok) {
    const err = await blobRes.json().catch(() => ({}));
    throw new Error(`Error al crear blob: ${blobRes.status} - ${err.message || ''}`);
  }
  const blobData = await blobRes.json();
  
  // 4. Crear un tree nuevo con el blob
  const treeRes = await fetch(`${baseUrl}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [{
        path: FILE_PATH,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      }],
    }),
  });
  if (!treeRes.ok) throw new Error(`Error al crear tree: ${treeRes.status}`);
  const treeData = await treeRes.json();
  
  // 5. Crear el commit
  const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: `Actualización de datos: ${new Date().toLocaleString('es-AR')}`,
      tree: treeData.sha,
      parents: [latestCommitSha],
    }),
  });
  if (!newCommitRes.ok) throw new Error(`Error al crear commit: ${newCommitRes.status}`);
  const newCommitData = await newCommitRes.json();
  
  // 6. Actualizar la rama para que apunte al nuevo commit
  const updateRefRes = await fetch(`${baseUrl}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: newCommitData.sha,
      force: false,
    }),
  });
  if (!updateRefRes.ok) {
    const err = await updateRefRes.json().catch(() => ({}));
    throw new Error(`Error al actualizar rama: ${updateRefRes.status} - ${err.message || ''}`);
  }
  
  return true;
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (!token || !validarTokenAdmin(token)) {
    return res.status(401).json({ error: 'No autorizado o token expirado' });
  }
  
  try {
    // 1. Descargar datos del Sheet
    const vias = await descargarHoja('VIAS DE EXCEPCION', 'A:R');
    const alt = await descargarHoja('ALTERNATIVOS', 'A:Z');
    
    // 2. Filtrar registros vacíos
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
    
    // 3. Subir a GitHub usando Git Data API
    await subirAGitHubGitData(datos);
    
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
