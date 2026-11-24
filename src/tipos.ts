// Tipos compartilhados do liveflow. Nada aqui executa nada.

/** Ações que um passo do "Como testar" pode ter. Cada passo tem exatamente uma. */
export const ACOES = ['abrir', 'clicar', 'preencher', 'selecionar', 'marcar', 'enviar_arquivo', 'ver_texto', 'nao_ver_texto', 'ver_url', 'guardar', 'api', 'ver_email', 'conferir_manual', 'esperar_ms'] as const;
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
  | { acao: 'enviar_arquivo'; campo: string; arquivos: string[] }
  | { acao: 'guardar'; nome: string; da_url?: string; do_texto?: string }
  | { acao: 'api'; metodo: string; rota: string; corpo?: unknown; status: number; contem?: Record<string, unknown>; guardar?: Record<string, string> }
  | { acao: 'ver_email'; para: string; assunto?: string; guardar_link?: { nome: string; contem?: string } }
  | { acao: 'conferir_manual'; texto: string }
  | { acao: 'esperar_ms'; ms: number };

/** Passo já validado, com a linha de origem e o critério que ele prova (se houver). */
export type PassoCard = Passo & {
  n: number;
  criterio?: number;
  /** Em jornadas: de qual card veio o passo. */
  etapa?: string;
  /** Conta (pessoa) que faz o passo, definida em "contas". Sem "como" = visitante sem login. */
  como?: string;
};

/** Uma pessoa de teste: como entra no sistema e como saber que a sessão ainda vale. */
export interface Conta {
  nome: string;
  entrar: PassoCard[];
  /** Passos que confirmam que a sessão guardada ainda vale (ex.: abrir /painel e ver "Sair"). */
  verificar?: PassoCard[];
  /** Guardar a sessão entre cards do mesmo bloco (mais rápido). Sempre confirmada com "verificar". */
  reaproveitar: boolean;
}

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
  /** "jornada" junta os passos de outros cards, em ordem, num teste só. */
  tipo: 'card' | 'jornada';
  /** Só em jornada: ids dos cards, na ordem. */
  etapas?: string[];
  /** O que o card muda (ex.: orcamentos, configuracoes). Cards que mudam a mesma coisa não rodam ao mesmo tempo. */
  altera: string[];
  /** Cards que precisam passar antes. Se um falhar, este não roda. Não carrega estado: cada card prepara o seu. */
  depende_de: string[];
  /** Roda sozinho, sem nada em paralelo (ex.: muda configuração global). */
  exclusivo: boolean;
  /** Tela usada no fluxo. celular = 390 px, toque e navegador de celular. */
  dispositivo: 'desktop' | 'celular';
  /** Card já entregue (merge feito): passa a rodar no código da base, como regressão. */
  entregue: boolean;
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

/** Um processo do sistema (app, api, worker). Pode estar em outro repositório. */
export interface Servico {
  nome: string;
  /** Comando para subir. Use {{porta}} (a dele), {{porta.outro}} e {{url.outro}}. */
  iniciar: string;
  saude: string;
  /** Pasta de outro repositório (relativa a este). Sem ela, é este repositório. */
  repo?: string;
  /** Base do outro repositório, quando ele não tem a branch do card. */
  base?: string;
  preparar?: string;
}

export interface Sistema {
  /** Endereço do sistema em teste. Pode ter {{porta}} (do primeiro serviço) ou {{porta.nome}}. */
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
  /** Processos a subir por bloco. "iniciar" sozinho vira um serviço chamado app. */
  servicos: Servico[];
  /** Caixa de e-mail de teste (Mailpit), para o passo ver_email. */
  email?: { mailpit: string };
  /** Reaproveitar node_modules quando o lockfile da branch é igual ao do seu checkout. */
  reaproveitarDependencias: boolean;
  /** Comando que zera o banco de teste antes de cada tentativa. Pode usar {{execucao}}. */
  seed?: string;
  /** Quantos fluxos ao mesmo tempo. Só passa de 1 se cada execução tiver app e banco próprios. */
  paralelo: number;
}

export interface Artefato {
  versao: 1;
  sistema: Sistema;
  variaveis: Record<string, string>;
  contas: Record<string, Conta>;
  cards: CardAvaliado[];
  /** Problemas do arquivo inteiro (não de um card). */
  problemas: string[];
}

export type Resultado = 'passou' | 'falhou' | 'instavel' | 'nao_rodou' | 'nao_se_aplica';

export type Certeza = 'confirmado' | 'suspeita';
export type Origem = 'novo' | 'ja_existia';
