// api/login.js
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const { username, password } = req.body;
  const ADMIN_USER = process.env.ADMIN_USER;
  const ADMIN_PASS = process.env.ADMIN_PASS;
  const JWT_SECRET = process.env.JWT_SECRET;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '8h' });
    return res.status(200).json({ token });
  }

  return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
}
