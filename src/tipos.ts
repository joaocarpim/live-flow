// Tipos compartilhados do liveflow. Nada aqui executa nada.

/** Ações que um passo do "Como testar" pode ter. Cada passo tem exatamente uma. */
export const ACOES = ['abrir', 'clicar', 'preencher', 'selecionar', 'marcar', 'ver_texto', 'nao_ver_texto', 'ver_url', 'api', 'esperar_ms'] as const;
export type Acao = (typeof ACOES)[number];

export type Passo =
  | { acao: 'abrir'; caminho: string }
  | { acao: 'clicar'; alvo: string }
  | { acao: 'preencher'; campo: string; valor: string }
  | { acao: 'selecionar'; campo: string; opcao: string }
  | { acao: 'marcar'; campo: string }
  | { acao: 'ver_texto'; texto: string }
  | { acao: 'nao_ver_texto'; texto: string }
  | { acao: 'ver_url'; padrao: string }
  | { acao: 'api'; metodo: string; rota: string; corpo?: unknown; status: number; contem?: Record<string, unknown> }
  | { acao: 'esperar_ms'; ms: number };

/** Passo já validado, com a linha de origem e o critério que ele prova (se houver). */
export type PassoCard = Passo & { n: number; criterio?: number };

export interface PerfilCard {
  interface?: boolean;
  upload?: boolean;
  migracao?: boolean;
  perfis?: string[];
  carga?: { usuarios: number; p95_ms: number };
  vizinhos?: 'auto' | 'nao' | string[];
}

export interface Card {
  id: string;
  titulo: string;
  descricao?: string;
  /** Branch onde o código do card está (local "feat/x" ou remota "origin/feat/x"). */
  branch?: string;
  /** Padrões de arquivo do card, usados quando não há branch declarada. */
  arquivos?: string[];
  criterios: string[];
  como_testar: PassoCard[];
  perfil: PerfilCard;
}

export type EstadoCard = 'pronto' | 'sem_passos' | 'invalido';

export interface CardAvaliado {
  card: Card;
  estado: EstadoCard;
  /** Por que o card não pode ser selecionado, em linguagem simples. */
  problemas: string[];
}

export interface Sistema {
  /** Endereço do sistema em teste. Pode ter {{porta}} quando o liveflow inicia o app. */
  url: string;
  /** Hosts que podem receber testes (inclusive ataque e carga). */
  permitidos: string[];
  /** Hosts que nunca são alvo, mesmo se alguém colocar em "permitidos". */
  producao: string[];
  /** Branch de comparação (main, master...). */
  base: string;
  /** Comando para preparar uma cópia da branch (ex.: npm ci). Roda uma vez por cópia. */
  preparar?: string;
  /** Comando para subir o app da branch. Use {{porta}}. Sem ele, o liveflow não garante qual código está no ar. */
  iniciar?: string;
  /** Caminho que responde quando o app está pronto. */
  saude: string;
  /** Comando que zera o banco de teste antes de cada tentativa. Pode usar {{execucao}}. */
  seed?: string;
  /** Quantos fluxos ao mesmo tempo. Só passa de 1 se cada execução tiver app e banco próprios. */
  paralelo: number;
}

export interface Artefato {
  versao: 1;
  sistema: Sistema;
  variaveis: Record<string, string>;
  cards: CardAvaliado[];
  /** Problemas do arquivo inteiro (não de um card). */
  problemas: string[];
}

export type Resultado = 'passou' | 'falhou' | 'instavel' | 'nao_rodou' | 'nao_se_aplica';

export type Certeza = 'confirmado' | 'suspeita';
export type Origem = 'novo' | 'ja_existia';
