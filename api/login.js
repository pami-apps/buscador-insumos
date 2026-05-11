// ============================================================
// API: Login de usuario normal
// Endpoint: POST /api/login
// ============================================================

const USER_PASSWORD = process.env.USER_PASSWORD || '*InsumosAlt2026';

export default function handler(req, res) {
  // Solo acepta POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { password } = req.body;

  // Validar que la contraseña sea correcta
  if (password !== USER_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  // Si es correcta, generar JWT simple
  // (Por ahora un token básico, en PASO siguiente lo hacemos con librería jwt)
  const token = Buffer.from(
    JSON.stringify({
      type: 'user',
      iat: Date.now(),
      exp: Date.now() + 3600000, // 1 hora
    })
  ).toString('base64');

  return res.status(200).json({
    success: true,
    token: token,
    message: 'Login exitoso',
  });
}
