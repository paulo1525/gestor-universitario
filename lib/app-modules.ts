export type AppModuleKey =
  | "classes"
  | "classes.rosters"
  | "classes.preferences"
  | "classes.placements"
  | "announcements"
  | "announcements.feed"
  | "announcements.publishing"
  | "curricular_units"
  | "curricular_units.catalog"
  | "curricular_units.management"
  | "curricular_units.detail"
  | "calendar"
  | "calendar.events"
  | "calendar.management"
  | "documents"
  | "documents.library"
  | "documents.management"
  | "requests"
  | "requests.submission"
  | "requests.management"
  | "directory"
  | "directory.members"
  | "polls"
  | "polls.voting"
  | "polls.management"
  | "dashboard"
  | "dashboard.analytics"
  | "search"
  | "search.global"
  | "materials"
  | "materials.library"
  | "materials.submission"
  | "materials.moderation";

export type AppModuleDefinition = {
  key: AppModuleKey;
  label: string;
  description: string;
  parentKey: AppModuleKey | null;
  defaultEnabled: boolean;
};

export const APP_MODULES: readonly AppModuleDefinition[] = [
  { key: "classes", label: "Gestão de turmas", description: "Composição, preferências e distribuição das turmas.", parentKey: null, defaultEnabled: true },
  { key: "classes.rosters", label: "Listas e composição", description: "Consulta, composição e submissão das listas de turma.", parentKey: "classes", defaultEnabled: true },
  { key: "classes.preferences", label: "Preferências dos estudantes", description: "Recolha das decisões de permanência ou mudança de turma.", parentKey: "classes", defaultEnabled: true },
  { key: "classes.placements", label: "Colocações", description: "Validação, cálculo, revisão e publicação das colocações.", parentKey: "classes", defaultEnabled: true },
  { key: "announcements", label: "Avisos e comunicados", description: "Comunicação institucional da Comissão de Curso.", parentKey: null, defaultEnabled: true },
  { key: "announcements.feed", label: "Consulta de avisos", description: "Apresentação dos avisos publicados aos utilizadores.", parentKey: "announcements", defaultEnabled: true },
  { key: "announcements.publishing", label: "Publicação por membros CC", description: "Editor de comunicados para membros com cargo na Comissão.", parentKey: "announcements", defaultEnabled: true },
  { key: "curricular_units", label: "Unidades curriculares", description: "Catálogo de cadeiras e representantes da Comissão.", parentKey: null, defaultEnabled: true },
  { key: "curricular_units.catalog", label: "Catálogo e créditos", description: "Consulta de unidades curriculares, ano, semestre e ECTS.", parentKey: "curricular_units", defaultEnabled: true },
  { key: "curricular_units.management", label: "Gestão pelo Núcleo", description: "Criação e edição reservadas ao Núcleo de Gestão.", parentKey: "curricular_units", defaultEnabled: true },
  { key: "curricular_units.detail", label: "Área de cada unidade curricular", description: "Página agregada com representante, eventos, documentos e comunicados.", parentKey: "curricular_units", defaultEnabled: true },
  { key: "calendar", label: "Calendário académico", description: "Avaliações, entregas, eventos e prazos académicos.", parentKey: null, defaultEnabled: true },
  { key: "calendar.events", label: "Consulta do calendário", description: "Calendário cronológico com filtros por unidade curricular.", parentKey: "calendar", defaultEnabled: true },
  { key: "calendar.management", label: "Gestão de eventos", description: "Criação e edição de avaliações, entregas e eventos pela Comissão.", parentKey: "calendar", defaultEnabled: true },
  { key: "documents", label: "Documentos e atas", description: "Arquivo documental da Comissão de Curso.", parentKey: null, defaultEnabled: true },
  { key: "documents.library", label: "Biblioteca documental", description: "Consulta de atas, regulamentos, formulários e documentos úteis.", parentKey: "documents", defaultEnabled: true },
  { key: "documents.management", label: "Gestão documental", description: "Publicação, visibilidade e atualização de documentos.", parentKey: "documents", defaultEnabled: true },
  { key: "requests", label: "Pedidos e sugestões", description: "Canal de contacto identificado ou anónimo com a Comissão.", parentKey: null, defaultEnabled: true },
  { key: "requests.submission", label: "Envio de pedidos", description: "Submissão identificada ou anónima de pedidos e sugestões.", parentKey: "requests", defaultEnabled: true },
  { key: "requests.management", label: "Gestão de pedidos", description: "Triagem, estados e respostas públicas ou privadas.", parentKey: "requests", defaultEnabled: true },
  { key: "directory", label: "Representantes e contactos", description: "Diretório sincronizado com os membros registados.", parentKey: null, defaultEnabled: true },
  { key: "directory.members", label: "Diretório da Comissão", description: "Membros, cargos, núcleos e unidades representadas.", parentKey: "directory", defaultEnabled: true },
  { key: "polls", label: "Inquéritos rápidos", description: "Votações e recolha de opinião dos estudantes.", parentKey: null, defaultEnabled: true },
  { key: "polls.voting", label: "Participação em inquéritos", description: "Consulta, votação e resultados disponibilizados.", parentKey: "polls", defaultEnabled: true },
  { key: "polls.management", label: "Gestão de inquéritos", description: "Criação, encerramento e publicação de resultados.", parentKey: "polls", defaultEnabled: true },
  { key: "dashboard", label: "Dashboard administrativo", description: "Indicadores operacionais e ações pendentes.", parentKey: null, defaultEnabled: true },
  { key: "dashboard.analytics", label: "Indicadores administrativos", description: "Métricas de módulos, pedidos, comunicados e atividade.", parentKey: "dashboard", defaultEnabled: true },
  { key: "search", label: "Pesquisa global", description: "Pesquisa unificada em toda a aplicação.", parentKey: null, defaultEnabled: true },
  { key: "search.global", label: "Pesquisa e arquivo", description: "Pesquisa em comunicados, cadeiras, documentos, eventos e materiais.", parentKey: "search", defaultEnabled: true },
  { key: "materials", label: "Materiais de estudo", description: "Partilha moderada de exames, resumos, sebentas e outros recursos.", parentKey: null, defaultEnabled: true },
  { key: "materials.library", label: "Biblioteca de materiais", description: "Consulta dos materiais aprovados por unidade curricular.", parentKey: "materials", defaultEnabled: true },
  { key: "materials.submission", label: "Envio de materiais", description: "Submissão identificada ou anónima de ficheiros e fotografias.", parentKey: "materials", defaultEnabled: true },
  { key: "materials.moderation", label: "Moderação de materiais", description: "Revisão, aprovação ou rejeição antes da publicação.", parentKey: "materials", defaultEnabled: true },
] as const;

export const APP_MODULE_KEYS = new Set<string>(APP_MODULES.map((module) => module.key));

export function moduleParentKey(key: string): AppModuleKey | null {
  return APP_MODULES.find((module) => module.key === key)?.parentKey ?? null;
}

export function moduleEffectiveEnabled(key: string, states: Record<string, boolean>): boolean {
  if (states[key] === false) return false;
  const parentKey = moduleParentKey(key);
  return parentKey ? states[parentKey] !== false : true;
}
