// api/editar-conta.js
import jwt from 'jsonwebtoken';
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  // Verificar token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }

  const { id, diamantes, gold, banido } = req.body;
  if (id === undefined) {
    return res.status(400).json({ erro: 'ID da conta é obrigatório' });
  }

  let contas = await kv.get('contas');
  contas = contas ? JSON.parse(contas) : [];

  const index = contas.findIndex(c => c.id == id);
  if (index === -1) {
    return res.status(404).json({ erro: 'Conta não encontrada' });
  }

  // Atualiza apenas os campos fornecidos
  if (diamantes !== undefined) contas[index].diamantes = Number(diamantes);
  if (gold !== undefined) contas[index].gold = Number(gold);
  if (banido !== undefined) contas[index].banido = Boolean(banido);

  // Salvar de volta no KV
  await kv.set('contas', JSON.stringify(contas));

  return res.status(200).json({ sucesso: true, conta: contas[index] });
}
