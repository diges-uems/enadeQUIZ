import { db } from '../src/lib/db'

async function main() {
  const existingSession = await db.session.findUnique({
    where: { code: 'ENADE25' },
  })

  if (existingSession) {
    console.log('Session ENADE25 already exists, skipping seed.')
    return
  }

  const questions = [
    {
      text: 'A Lei de Acesso à Informação (Lei nº 12.527/2011) estabelece que órgãos públicos devem disponibilizar informações de interesse público. Sobre o princípio da transparência na administração pública brasileira, é correto afirmar que:',
      altA: 'A transparência é opcional e depende da discricionariedade do agente público',
      altB: 'O acesso à informação é regra, e o sigilo é exceção, devendo ser justificado',
      altC: 'Apenas cidadãos com grau de instrução superior podem solicitar informações públicas',
      altD: 'Informações sobre gastos públicos são sigilosas e não podem ser divulgadas',
      altE: 'A transparência aplica-se apenas ao Poder Executivo, excluídos Legislativo e Judiciário',
      correctAnswer: 'B',
      year: 2025,
      course: 'Formação Geral',
    },
    {
      text: 'O conceito de desenvolvimento sustentável, amplamente discutido desde o Relatório Brundtland (1987), pressupõe a conciliação entre crescimento econômico, equidade social e preservação ambiental. No contexto brasileiro, qual das afirmações abaixo melhor reflete os desafios para a efetivação do desenvolvimento sustentável?',
      altA: 'A exploração intensiva de recursos naturais é compatível com o desenvolvimento sustentável, desde que acompanhada de compensação financeira',
      altB: 'O crescimento econômico, por si só, garante a sustentabilidade ambiental e a justiça social',
      altC: 'A transição para modelos sustentáveis exige mudanças nos padrões de produção e consumo, bem como políticas públicas integradas',
      altD: 'O desenvolvimento sustentável depende exclusivamente de ações da iniciativa privada, sem necessidade de regulação estatal',
      altE: 'Os indicadores de desenvolvimento sustentável são irrelevantes para a formulação de políticas públicas no Brasil',
      correctAnswer: 'C',
      year: 2025,
      course: 'Formação Geral',
    },
    {
      text: 'A inteligência artificial (IA) tem transformado diversos setores da sociedade, desde a saúde até o mercado de trabalho. Considerando os aspectos éticos relacionados ao uso da IA, assinale a alternativa correta:',
      altA: 'A IA é isenta de vieses, pois seus algoritmos são baseados exclusivamente em lógica matemática',
      altB: 'A regulamentação da IA deve equilibrar a inovação tecnológica com a proteção de direitos fundamentais',
      altC: 'O uso de IA em processos seletivos eliminou completamente a discriminação no mercado de trabalho',
      altD: 'A privacidade dos dados pessoais não é afetada pelo uso de sistemas de inteligência artificial',
      altE: 'A substituição de trabalhadores por IA é um mito e não constitui um desafio real para a sociedade',
      correctAnswer: 'B',
      year: 2025,
      course: 'Formação Geral',
    },
    {
      text: 'O Estatuto da Pessoa com Deficiência (Lei nº 13.146/2015) garantiu direitos fundamentais para a inclusão social. Sobre a educação inclusiva no ensino superior brasileiro, é correto afirmar que:',
      altA: 'As instituições de ensino superior são dispensadas de oferecer acessibilidade arquitetônica',
      altB: 'A reserva de vagas para pessoas com deficiência em instituições públicas é opcional',
      altC: 'Instituições de ensino devem garantir acessibilidade em todas as suas formas: arquitetônica, comunicacional, metodológica e instrumental',
      altD: 'A inclusão de alunos com deficiência limita a qualidade do ensino oferecido aos demais estudantes',
      altE: 'O atendimento educacional especializado é exclusivo da educação básica, não se aplicando ao ensino superior',
      correctAnswer: 'C',
      year: 2025,
      course: 'Formação Geral',
    },
    {
      text: 'A democracia participativa complementa a democracia representativa por meio de mecanismos de engajamento direto dos cidadãos nas decisões públicas. No Brasil, qual instrumento exemplifica a democracia participativa?',
      altA: 'A eleição indireta de presidentes da República por membros do Congresso Nacional',
      altB: 'O orçamento participativo, que permite à população deliberar sobre a alocação de recursos públicos',
      altC: 'A nomeação de ministros do Supremo Tribunal Federal pelo Presidente da República',
      altD: 'O veto presidencial a projetos de lei aprovados pelo Legislativo',
      altE: 'A fiscalização dos Tribunais de Contas sobre a aplicação de recursos públicos',
      correctAnswer: 'B',
      year: 2025,
      course: 'Formação Geral',
    },
  ]

  const session = await db.session.create({
    data: {
      code: 'ENADE25',
      title: 'ENADE 2025 — Formação Geral',
      status: 'active',
      questions: {
        create: questions.map((q, index) => ({
          text: q.text,
          altA: q.altA,
          altB: q.altB,
          altC: q.altC,
          altD: q.altD,
          altE: q.altE,
          correctAnswer: q.correctAnswer,
          year: q.year,
          course: q.course,
          orderIndex: index,
        })),
      },
    },
    include: {
      questions: true,
    },
  })

  console.log(`Seed completed! Created session "${session.title}" with ${session.questions.length} questions.`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
