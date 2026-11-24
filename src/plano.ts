// O plano diz, antes de rodar, o que cada camada vai fazer neste card, e por quê.
// Nada some em silêncio: o que não roda aparece com o motivo.
import { ehArquivoDeTela } from './fontes.ts';
import type { Card } from './tipos.ts';

export type Modo = 'rapido' | 'completo' | 'noturno';

export interface ContextoPlano {
  card: Card;
  arquivos: string[];
  modo: Modo;
}

export interface Camada {
  id: string;
  grupo: 'Código' | 'API e dados' | 'Interface' | 'Segurança' | 'Robustez';
  nome: string;
  /** Modos em que a camada entra. */
  modos: Modo[];
  /** Já existe execução desta camada nesta versão do liveflow? */
  implementada: boolean;
  aplica?: (c: ContextoPlano) => string | null;
}

const temTela = (c: ContextoPlano) => (c.card.perfil.interface === false ? 'perfil do card: interface: nao' : c.card.perfil.interface === true || c.arquivos.some(ehArquivoDeTela) || c.card.como_testar.some((p) => p.acao !== 'api') ? null : 'nenhum arquivo de tela mudou');
const temMigracao = (c: ContextoPlano) => (c.card.perfil.migracao === true || c.arquivos.some((a) => /(^|\/)(migrations?|db\/migrate|prisma\/migrations)\//i.test(a)) ? null : 'nenhum arquivo de migração na branch');
const temUpload = (c: ContextoPlano) => (c.card.perfil.upload === true ? null : c.card.perfil.upload === false ? 'perfil do card: upload: nao' : 'o perfil do card não declara upload');
const temCarga = (c: ContextoPlano) => (c.card.perfil.carga ? null : 'o card não tem meta de carga (testes.carga)');
const temPerfis = (c: ContextoPlano) => (c.card.perfil.perfis?.length ? null : 'o card não lista perfis de acesso');

const TODOS: Modo[] = ['rapido', 'completo', 'noturno'];
const COMPLETO: Modo[] = ['completo', 'noturno'];
const NOITE: Modo[] = ['noturno'];

export const CAMADAS: Camada[] = [
  { id: 'estatica', grupo: 'Código', nome: 'Estática', modos: TODOS, implementada: false },
  { id: 'dependencias', grupo: 'Código', nome: 'Dependências vulneráveis', modos: COMPLETO, implementada: false },
  { id: 'unitaria', grupo: 'Código', nome: 'Unitária', modos: TODOS, implementada: false },
  { id: 'propriedades', grupo: 'Código', nome: 'Propriedades, datas e formatos BR', modos: COMPLETO, implementada: false },
  { id: 'mutacao', grupo: 'Código', nome: 'Mutação (só linhas do card)', modos: COMPLETO, implementada: false },
  { id: 'integracao', grupo: 'API e dados', nome: 'Integração', modos: COMPLETO, implementada: false },
  { id: 'contrato', grupo: 'API e dados', nome: 'Contrato (OpenAPI)', modos: COMPLETO, implementada: false },
  { id: 'permissoes', grupo: 'API e dados', nome: 'Permissões por perfil', modos: COMPLETO, implementada: false, aplica: temPerfis },
  { id: 'webhooks', grupo: 'API e dados', nome: 'Webhooks e filas', modos: COMPLETO, implementada: false },
  { id: 'migracao', grupo: 'API e dados', nome: 'Migração de banco', modos: COMPLETO, implementada: false, aplica: temMigracao },
  { id: 'fluxo', grupo: 'Interface', nome: 'Fluxo completo', modos: TODOS, implementada: true, aplica: (c) => (c.card.como_testar.length ? null : 'o card não tem passo a passo') },
  { id: 'navegadores', grupo: 'Interface', nome: 'Navegadores e celular', modos: COMPLETO, implementada: false, aplica: temTela },
  { id: 'offline', grupo: 'Interface', nome: 'Offline e rede ruim', modos: COMPLETO, implementada: false, aplica: temTela },
  { id: 'acessibilidade', grupo: 'Interface', nome: 'Acessibilidade e visual', modos: COMPLETO, implementada: false, aplica: temTela },
  { id: 'desempenho', grupo: 'Interface', nome: 'Desempenho da página', modos: COMPLETO, implementada: false, aplica: temTela },
  { id: 'ataques', grupo: 'Segurança', nome: 'Ataques comuns', modos: TODOS, implementada: false },
  { id: 'sessao', grupo: 'Segurança', nome: 'Sessão e cabeçalhos', modos: COMPLETO, implementada: false },
  { id: 'upload', grupo: 'Segurança', nome: 'Upload de arquivos', modos: COMPLETO, implementada: false, aplica: temUpload },
  { id: 'fuzzing', grupo: 'Segurança', nome: 'Entradas aleatórias (fuzzing)', modos: COMPLETO, implementada: false },
  { id: 'concorrencia', grupo: 'Segurança', nome: 'Concorrência e envio duplo', modos: COMPLETO, implementada: false },
  { id: 'lgpd', grupo: 'Segurança', nome: 'Dados pessoais (LGPD)', modos: COMPLETO, implementada: false },
  { id: 'resiliencia', grupo: 'Robustez', nome: 'Resiliência', modos: COMPLETO, implementada: false },
  { id: 'vizinhos', grupo: 'Robustez', nome: 'Regressão dos cards vizinhos', modos: COMPLETO, implementada: true, aplica: (c) => (c.card.perfil.vizinhos === 'nao' ? 'perfil do card: vizinhos: nao' : null) },
  { id: 'carga', grupo: 'Robustez', nome: 'Carga e sobrecarga', modos: NOITE, implementada: false, aplica: temCarga },
  { id: 'soak', grupo: 'Robustez', nome: 'Teste longo (soak)', modos: NOITE, implementada: false, aplica: temCarga },
];

export type EstadoPlano = 'vai_rodar' | 'nao_se_aplica' | 'outro_modo' | 'ainda_nao_implementada';

export interface ItemPlano {
  camada: Camada;
  estado: EstadoPlano;
  motivo?: string;
}

export function montarPlano(c: ContextoPlano): ItemPlano[] {
  return CAMADAS.map((camada) => {
    const naoAplica = camada.aplica?.(c) ?? null;
    if (naoAplica) return { camada, estado: 'nao_se_aplica', motivo: naoAplica };
    if (!camada.modos.includes(c.modo)) return { camada, estado: 'outro_modo', motivo: `só no modo ${camada.modos[0]}` };
    if (!camada.implementada) return { camada, estado: 'ainda_nao_implementada', motivo: 'chega numa próxima versão do liveflow' };
    return { camada, estado: 'vai_rodar' };
  });
}
