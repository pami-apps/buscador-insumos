// ============================================================
// GITHUB API - Sube data.json al repo para compartir con todos
// ============================================================
// El token de GitHub se pide al admin al momento de actualizar.
// Los datos quedan en public/data.json y todos los usuarios los leen.
const REPO_OWNER = 'pami-apps'  // ← REEMPLAZA CON TU USUARIO
const REPO_NAME  = 'buscador-insumos'
const FILE_PATH  = 'public/data.json'

export async function subirDataAGitHub(data, githubToken) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`

  // 1. Obtener el SHA del archivo actual (necesario para actualizarlo)
  let sha = null
  const getRes = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    }
  })
  if (getRes.ok) {
    const fileData = await getRes.json()
    sha = fileData.sha
  } else if (getRes.status !== 404) {
    throw new Error(`Error al leer archivo existente: ${getRes.status}`)
  }

  // 2. Convertir data a base64
  const json = JSON.stringify({ ...data, updatedAt: new Date().toISOString() })
  const base64 = btoa(unescape(encodeURIComponent(json)))

  // 3. Subir el archivo
  const body = {
    message: `Actualización de datos: ${new Date().toLocaleString('es-AR')}`,
    content: base64,
    ...(sha ? { sha } : {}),
  }

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}))
    throw new Error(`Error al subir: ${putRes.status} - ${err.message || ''}`)
  }

  return true
}
