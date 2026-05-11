// ============================================================
// API: Login de admin
// Endpoint: POST /api/auth-admin
// ============================================================

const ADMIN_USER = process.env.ADMIN_USER || 'administrador';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'PaPo2716Mat';

export default function handler(req, res) {
  // Solo acepta POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { user, password } = req.body;

  // Validar credenciales
  if (user !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  // Si es correcto, generar JWT admin
  const token = Buffer.from(
    JSON.stringify({
      type: 'admin',
      user: ADMIN_USER,
      iat: Date.now(),
      exp: Date.now() + 3600000, // 1 hora
    })
  ).toString('base64');

  return res.status(200).json({
    success: true,
    token: token,
    message: 'Login admin exitoso',
  });
}
