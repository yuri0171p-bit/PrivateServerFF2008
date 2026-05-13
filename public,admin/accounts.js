// accounts.js
// Funções comuns para interagir com as APIs

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function sair() {
  localStorage.removeItem('token');
  window.location.href = '/index.html';
}

// Redireciona para login se não autenticado
function verificarAutenticacao() {
  if (!getToken()) {
    window.location.href = '/index.html';
  }
}

async function carregarContas() {
  const res = await fetch(`${API_BASE}/contas`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  if (res.status === 401) {
    sair();
    return [];
  }
  return await res.json();
}

async function salvarConta(id, dados) {
  const res = await fetch(`${API_BASE}/editar-conta`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ id, ...dados })
  });
  if (res.status === 401) {
    sair();
    return null;
  }
  return await res.json();
}
