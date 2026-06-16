#!/usr/bin/env python3
"""Build JSON file with 15 ENADE 2025 Administracao Formacao Geral questions."""
import json

# Helper to build question text preserving line breaks from PDF
def q(num, text, alts, correct, image=None):
    return {
        "title": f"ENADE 2025 Administração - Formação Geral - Questão {num:02d}",
        "text": text.strip(),
        "year": 2025,
        "course": "Formação Geral",
        "altA": alts["A"].strip(),
        "altB": alts["B"].strip(),
        "altC": alts["C"].strip(),
        "altD": alts["D"].strip(),
        "altE": "",
        "correctAnswer": correct,
        "imageUrl": image,
        "category": "ENADE 2025 - Administração",
        "tags": "ENADE,2025,Administração,Formação Geral",
    }

questions = []

# ── Q01 ───────────────────────────────────────────────────────────
questions.append(q(1, """
TEXTO 1
Como resposta às mudanças climáticas, o Brasil tem ampliado o uso de fontes renováveis, como biocombustíveis e as fontes eólica e solar. No entanto, para criar uma trajetória progressiva de sustentabilidade ao longo do tempo, o País precisa considerar as relações socioeconômicas e ambientais, além das alterações na base tecnológica. Para isso, é fundamental considerar os impactos que a transição energética pode causar nas comunidades vulneráveis. Esses impactos podem ser positivos, mas também podem aprofundar as desigualdades vivenciadas por essas comunidades.

Disponível em: https://www.epe.gov.br. Acesso em: 8 jun. 2025 (adaptado).

TEXTO 2
Iniciada em meados de 2021, a instalação de um parque solar no município de Santa Luzia passou a impactar a comunidade quilombola de Pitombeira, situada no município vizinho de Várzea, no semiárido paraibano. Moradores passaram a sentir os impactos do desmatamento da vegetação nativa da Caatinga: deslocamento e(ou) morte de animais silvestres; aumento do trânsito e de pessoas "de fora"; rachaduras de casas e cisternas, em razão das explosões que foram realizadas durante a instalação dos painéis solares. Conforme uma liderança quilombola, os impactos serão sentidos a curto, médio e longo prazo. Estima-se que 335 hectares de mata nativa de Caatinga tenham sido completamente desmatados para a construção do parque mencionado. Houve o aterramento de riachos, açudes e lagoas no interior das fazendas, associado a ações de compactação e impermeabilização do solo.

CAVALCANTE, L. V. et al. As contradições da energia renovável no Semiárido: o caso da injustiça ambiental produzida por empreendimento de energia solar na Comunidade Quilombola Pitombeira (Paraíba – Brasil). Revista Nera, v. 28, n. 1, 2025 (adaptado).

Com base nos Textos 1 e 2, assinale a opção que apresenta três fatores relativos à transição energética que agravam as condições de vida de comunidades vulneráveis.
""", {
    "A": "Aumento descontrolado da fauna, perda de empregos e violação dos direitos humanos.",
    "B": "Desenvolvimento de economia circular, deslocamento populacional e conflitos sociais.",
    "C": "Necessidade de requalificação profissional, perda de territórios e desequilíbrio ambiental.",
    "D": "Valorização do conhecimento científico, aumento da resiliência ambiental e ausência de participação social.",
}, "C"))

# ── Q02 ───────────────────────────────────────────────────────────
questions.append(q(2, """
TEXTO 1
Art. 1º É instituída a Lei Brasileira de Inclusão da Pessoa com Deficiência (Estatuto da Pessoa com Deficiência), destinada a assegurar e a promover, em condições de igualdade, o exercício dos direitos e das liberdades fundamentais por pessoa com deficiência, visando à sua inclusão social e seu exercício de cidadania.

Disponível em: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm. Acesso em: 25 maio 2025 (adaptado).

TEXTO 2
No caso da cultura, a lei voltou-se diretamente à promoção daquilo que conhecemos como acessibilidade cultural, que pode ser compreendida como um conjunto de medidas que visam à eliminação de barreiras e à promoção da participação plena das pessoas com deficiência em políticas, programas, projetos e ações culturais. Essas ações propiciam à pessoa com deficiência ou com mobilidade reduzida a possibilidade de viver de forma independente e exercer seus direitos culturais.

Disponível em: https://www.gov.br/cultura. Acesso em: 25 maio. 2025 (adaptado).

A partir das informações apresentadas, é correto afirmar que a acessibilidade cultural é efetivada não somente com o acesso de pessoas com deficiência a bens culturais, mas também com a
""", {
    "A": "inclusão dessas pessoas no mercado de trabalho, por meio de sua atuação como produtoras de cultura.",
    "B": "restrição de acesso e participação dessas pessoas em eventos de arte e cultura nos quais ocorram grandes aglomerações.",
    "C": "criação de eventos voltados a públicos formados por essas pessoas, a fim de manter a exclusividade de seu acesso aos bens culturais.",
    "D": "manutenção de políticas de acessibilidade, as quais dispensam a participação da sociedade civil e da iniciativa privada, por se tratar de responsabilidade do Estado.",
}, "A"))

# ── Q03 ───────────────────────────────────────────────────────────
questions.append(q(3, """
De acordo com o Alto Comissariado das Nações Unidas para Refugiados (ACNUR), no final de 2023, estimava-se que 117,3 milhões de pessoas em todo o mundo foram deslocadas à força, o que representa um aumento de 8%, ou 8,8 milhões de pessoas, em relação ao final de 2022. Esses dados revelam aumentos anuais sucessivos na quantidade de pessoas forçadas a se deslocar.

Disponível em: https://www.unhcr.org/global-trends-report-2023. Acesso em: 5 jun. 2025 (adaptado).

Considerando-se essas informações e o que se refere aos movimentos migratórios no século XXI, é correto afirmar que os fluxos de pessoas forçadas a se deslocar
""", {
    "A": "ocorrem em direção aos países mais ricos e desenvolvidos, que abrigam a maioria da população refugiada do mundo, oferecendo serviços públicos e de acolhida de qualidade.",
    "B": "intensificaram-se em direção aos países menos desenvolvidos, nos quais existem políticas migratórias mais flexíveis e melhor infraestrutura para recepcionar populações refugiadas.",
    "C": "aumentaram como consequência do fortalecimento dos direitos dos migrantes, do gerenciamento integrado de fronteiras entre os países e do desenvolvimento de políticas de acolhimento promovidas pela ACNUR.",
    "D": "cresceram em decorrência do acirramento de conflitos e violações dos direitos humanos, com a maioria das pessoas vivendo em países vizinhos às suas nações de origem, onde também enfrentam barreiras sociais.",
}, "D"))

# ── Q04 ───────────────────────────────────────────────────────────
questions.append(q(4, """
TEXTO 1
O cinema é um espetáculo e, salvo exceções, o filme não é concebido para ser um documento histórico. É feito em primeiro lugar para ser vendido, e não para ser conservado em um museu, ainda menos em arquivos. Isto, contudo, não o impede de deter funções sociais diferenciadas, exercidas por meio da imprensa profissional, da crítica e do discurso analítico recente. Nesses termos, a instituição cinematográfica produziu grandes categorias de classificação reformuladas pela televisão: jornais televisivos para informar, documentários para educar, ficção para distrair.

Os filmes de ficção são ainda mais suspeitos, uma vez que têm uma função de divertimento, ainda que não raro um divertimento sério, quando se trata de colocar grandes problemas humanos e culturais, como puderam também fazer o teatro e o romance. Esses, com efeito, impõem questões contemporâneas, ou mesmo tentam testemunhar diretamente, principalmente nos períodos de crise, para informar e registrar uma memória visual e sonora dos eventos. Em certos casos específicos, pode-se mesmo solicitar ao cinema assumir um papel social ou político.

LAGNY, M. O Cinema como Fonte de História. In: Cinematógrafo: um olhar sobre a História. Salvador: EDUFBA, 2009 (adaptado).

TEXTO 2
Ainda Estou Aqui levou o prêmio de Melhor Filme Internacional no Oscar 2025. Essa foi a primeira vez que o Brasil trouxe o troféu para casa. Baseado no livro de Marcelo Rubens Paiva, o filme trata da morte do pai do autor, durante o período da ditadura militar no Brasil, a partir do ponto de vista de sua mãe, Eunice Paiva. O político e engenheiro foi tirado de casa em 1971 por agentes do regime e nunca mais retornou. Até hoje, as circunstâncias da morte não foram totalmente esclarecidas e ninguém foi punido pelo crime. Milhões de pessoas assistiram ao longa-metragem nos cinemas. Em todo o mundo, a produção arrecadou mais de US$ 27,4 milhões.

Disponível em: https://brasildefato.com.br. Acesso em: 20 maio 2025 (adaptado).

Considerando o Texto 1, que aborda a arte e sua função social, e o Texto 2, que trata da repercussão internacional do filme Ainda Estou Aqui, assinale a opção correta.
""", {
    "A": "A obra cinematográfica mencionada é sobretudo um documento histórico, na medida em que retrata o período da ditadura militar e faz um registro detalhado do desaparecimento do pai de Marcelo Rubens Paiva.",
    "B": "O cinema, assim como o teatro e o romance, constrói e produz sentidos, podendo criar significados variados, quanto a resgates históricos e representação social, mesmo em obras de entretenimento, como o filme mencionado.",
    "C": "A função do cinema é entreter e divertir, sendo natural a omissão das temáticas históricas, políticas e sociais das narrativas de filmes de ficção, como no filme em questão, produzido a partir da visão de um familiar do personagem retratado.",
    "D": "O longa-metragem em questão é emblemático, pois foi a primeira produção brasileira a ganhar o Oscar de melhor filme internacional, sendo a obra do cinema nacional mais vista e com a maior arrecadação de bilheteria já registrada no País.",
}, "B"))

# ── Q05 ───────────────────────────────────────────────────────────
questions.append(q(5, """
Eventos climáticos extremos, como secas ou enchentes, estão se tornando cada vez mais frequentes e severos em razão da mudança climática. No entanto, as consequências da ocorrência desses eventos estão além das questões ambientais, uma vez que promovem o deslocamento involuntário de populações vulneráveis desencadeando uma complexa cadeia de impactos de natureza socioambiental, econômica, ecológica, jurídica, política, psicológica e até mesmo de identidade e pertencimento. O fenômeno do deslocamento forçado requer atenção e soluções eficazes para sua gerência, uma vez que a população afetada necessita de condições adequadas para sua sobrevivência a longo prazo. Assim, as cidades precisam desenvolver uma infraestrutura urbana capaz de responder às emergências, de se preparar de maneira proativa para futuros desafios e ainda de absorver e se adaptar a essas novas dinâmicas causadas por deslocamentos massivos, de forma a garantir a proteção e promoção dos direitos humanos dos deslocados internos.

MATIAS, A. M. M. Paradiplomacia e urbanismo: possíveis aliadas na proteção da dignidade da pessoa humana dos deslocados internos. LIMONGI. A. A.; SOLDANO G. (Org.). In: Direito internacional do século XXI [e-book]: desafios globais contemporâneos. Santos: Editora Universitária Leopoldianum, p. 91, 2025 (adaptado).

Considerando o texto apresentado, assinale a opção correta sobre o deslocamento interno de populações vulneráveis.
""", {
    "A": "As cidades cumprem integralmente seu compromisso social ao implementar soluções urbanísticas que priorizam o atendimento emergencial aos deslocados internos.",
    "B": "Os eventos climáticos extremos tendem a afetar uniformemente a população local, por isso os deslocados internos lidam de forma semelhante com os impactos negativos.",
    "C": "A destruição de infraestrutura e a escassez de recursos como consequência da ocorrência de eventos climáticos extremos forçam a população local a se deslocar, transformando uma crise ambiental em uma crise humanitária.",
    "D": "As cidades que recebem os deslocados internos crescem economicamente em função do aumento da oferta de mão de obra e, dessa forma, desenvolvem locais mais seguros e recursos adequados para essa população reconstruir suas vidas.",
}, "C"))

# ── Q06 ───────────────────────────────────────────────────────────
questions.append(q(6, """
Um levantamento realizado em 2024 mostrou ligação entre o uso excessivo de redes sociais e o estado de saúde mental dos brasileiros. A pesquisa revelou que 65% dos entrevistados enfrentam dificuldades emocionais em algum grau. O uso intensivo de plataformas de redes sociais está associado a 45% dos casos de ansiedade em jovens de 15 a 29 anos de idade. Jovens que passam mais de três horas por dia em plataformas digitais têm um risco 30% maior de apresentar quadros de depressão, em comparação com aqueles que fazem um uso mais moderado. Cerca de 40% dos entrevistados relataram que sua autoestima é profundamente afetada pelo número de curtidas e comentários que recebem em suas postagens. Essa dependência de validação externa é mais pronunciada entre jovens que estão em fase de formação de identidade e são mais suscetíveis a julgamentos.

Disponível em: https://veja.abril.com.br/saude/excesso-de-redes-sociais-esta-associado-a-45%-dos-casos-de-ansiedade-em-jovens. Acesso em: 25 jun. 2025 (adaptado).

Considerando as informações do texto, assinale a opção que apresenta uma medida eficaz para prevenir os impactos negativos das redes sociais na saúde mental dos jovens, de forma a mitigar a causa de problemas como depressão e necessidade de validação externa.
""", {
    "A": "Implementar, nas escolas, programas sobre a necessidade de uso moderado de redes sociais, a fim de reduzir os riscos psicológicos da dependência digital entre jovens em geral.",
    "B": "Propor lei que obrigue as plataformas de redes sociais a permitirem a visualização de curtidas e comentários apenas em postagens temporárias, que se apagam automaticamente em 24 horas.",
    "C": "Realizar campanhas governamentais de comunicação na televisão sobre a importância de jovens com quadro de depressão ou ansiedade causado por problemas familiares procurarem apoio psicológico.",
    "D": "Aumentar o financiamento das organizações de saúde que oferecem suporte psicológico a jovens que apresentam quadros de depressão por uso excessivo de redes sociais, com vistas à reestruturação física dessas instituições.",
}, "A"))

# ── Q07 ───────────────────────────────────────────────────────────
questions.append(q(7, """
O número crescente de negociações exitosas para a repatriação de bens culturais no mundo mostra que se trata de uma ideia propícia ao nosso tempo, afirmou o diplomata Marco Antônio Nakata, diretor do Instituto Guimarães Rosa, órgão do Ministério das Relações Exteriores voltado para a diplomacia cultural. As negociações de restituição se dão de maneiras variadas e nem sempre partem dos governos; por vezes, comunidades locais pedem a restituição de objetos sagrados ou, no caso de fósseis, a comunidade científica nacional se mobiliza. Há, ainda, casos de museus e universidades que, por iniciativa própria, fazem a devolução.

Disponível em: https://g1.globo.com/ciencia/noticia/2023/07/23/. Acesso em: 17 jul. 2025 (adaptado).

Considerando o texto apresentado, que faz referência a um movimento mundial que defende a reterritorialização de objetos históricos, culturais e paleontológicos retirados dos seus países de origem durante a colonização ou ilegalmente comercializados nas últimas décadas, assinale a opção que apresenta um caso de reterritorialização ocorrido nos últimos anos.
""", {
    "A": "Exposição temporária de máscaras africanas que compõem o acervo do Museu de Cais de Branly, na França.",
    "B": "Retorno ao Brasil do Manto Tupinambá, que ficou exposto por mais de 300 anos no Museu Nacional da Dinamarca.",
    "C": "Aquisição, por colecionadores particulares, de artefatos maias que foram negociados em leilão internacional nos Estados Unidos.",
    "D": "Digitalização de cerâmicas pelo Museu de Etnologia em Lisboa, que possui a maior coleção de peças indígenas brasileiras da Europa.",
}, "B"))

# ── Q08 ───────────────────────────────────────────────────────────
questions.append(q(8, """
Na adolescência, quase todo gesto pode significar muito. A série Adolescência, da Netflix, mostrou que, apesar de emojis representarem emoções, objetos ou ideias quase sempre inofensivos, eles vêm sendo utilizados como uma forma de comunicação codificada entre adolescentes em plataformas digitais, sobretudo aquelas associadas a ideologias misóginas. Os emojis são comuns no universo de grupos como os incels, que são jovens que se autodenominam "celibatários involuntários". O termo incel está associado a uma subcultura on-line marcada por discursos de ódio e ressentimento contra mulheres. A imagem a seguir apresenta alguns emojis usados pelos adolescentes dessa subcultura.

Disponível em: https://gq.globo.com/cultura/. Acesso em: 9 jun. 2025 (adaptado).

Considerando o texto e as imagens apresentadas, assinale a opção correta, em relação ao papel dos símbolos na comunicação e na expressão no âmbito das comunidades digitais.
""", {
    "A": "A forma como emojis são empregados para legitimar opressões de gênero e de sexualidade demonstra que a linguagem digital é literal, o que torna o ambiente digital um reflexo das intenções dos usuários.",
    "B": "O emprego de emojis, como Pílula Vermelha ou Dinamite, dentro de grupos misóginos, evidencia que a linguagem visual é ambígua e que seu teor ideológico é construído a partir do modo como os símbolos são interpretados.",
    "C": "A incorporação de emojis à linguagem revela o caráter dinâmico desta, o que permite a atribuição de novos sentidos a símbolos, de modo que a interpretação de mensagens digitais requer conhecimento das comunidades em que são usadas.",
    "D": "O uso de emojis demonstra a adaptabilidade da linguagem a novas formas de expressão, embora mantenha os significados originalmente associados a esses recursos, o que facilita sua compreensão por usuários fora da comunidade incel.",
}, "C", image="/uploads/enade-2025-adm-fg-q8.png"))

# ── Q09 ───────────────────────────────────────────────────────────
questions.append(q(9, """
TEXTO 1
O Estatuto da Criança e do Adolescente (ECA), que completou 35 anos em 2025, estabelece o seguinte:

Art. 3º - A criança e o adolescente gozam de todos os direitos fundamentais inerentes à pessoa humana, sem prejuízo da proteção integral de que trata esta Lei, assegurando-se-lhes, por lei ou por outros meios, todas as oportunidades e facilidades, a fim de lhes facultar o desenvolvimento físico, mental, moral, espiritual e social, em condições de liberdade e de dignidade.

Parágrafo único. Os direitos enunciados nesta Lei aplicam-se a todas as crianças e adolescentes, sem discriminação de nascimento, situação familiar, idade, sexo, raça, etnia ou cor, religião ou crença, deficiência, condição pessoal de desenvolvimento e aprendizagem, condição econômica, ambiente social, região e local de moradia ou outra condição que diferencie as pessoas, as famílias ou a comunidade em que vivem.

BRASIL. Lei Federal n. 8.069, de 13 de julho de 1990. Estatuto da Criança e do Adolescente.

TEXTO 2
Crianças e adolescentes em insegurança alimentar por cor/raça

UNICEF. Pobreza multidimensional na infância e adolescência no Brasil, 2017-2025. Brasília: Unicef, 2025, p. 40.

Disponível em: https://www.unicef.org/brazil/. Acesso em: 20 maio 2025 (adaptado).

Considerando-se as informações dos Textos 1 e 2, os quais abordam, respectivamente, o ECA e dados de insegurança alimentar entre crianças e adolescentes no Brasil, é correto afirmar que
""", {
    "A": "as desigualdades de acesso à alimentação adequada, embora tenham diminuído entre 2009 e 2023, ainda impedem a plena efetivação da Lei no País, a qual está vigente há mais de trinta anos.",
    "B": "os dados referentes aos anos de 2009 e 2023 revelam uma redução constante dos casos mais graves de insegurança alimentar, e isso sugere que os objetivos do ECA serão alcançados nos próximos anos.",
    "C": "as disparidades raciais no que se refere à insegurança alimentar grave de crianças e adolescentes reduziram-se entre 2018 e 2023, o que revela que os direitos a que se refere o ECA estão sendo plenamente assegurados.",
    "D": "os números revelam a diminuição, entre 2009 e 2023, das diferenças raciais em termos de insegurança alimentar, sendo tal redução estipulada no ECA como a meta mais importante para a garantia dos direitos da criança e do adolescente.",
}, "A", image="/uploads/enade-2025-adm-fg-q9.png"))

# ── Q10 ───────────────────────────────────────────────────────────
questions.append(q(10, """
A diáspora científica é composta por pesquisadores com mestrado, doutorado ou pós-doutorado que deixam o país e não retornam. Uma pesquisa financiada pela Fundação de Amparo à Pesquisa do Estado de São Paulo (Fapesp) analisou a diáspora científica brasileira a partir de uma amostra de 1 200 pessoas em vários países. Ao todo, 67% disseram estar no exterior trabalhando, 31% estavam estudando e 2% não estavam nem estudando, nem trabalhando. Apenas 12% estavam desempregados quando saíram do Brasil. Entre aqueles que querem retornar ao país, muitos não o fazem por falta de oportunidade. A ideia de repatriação é relevante para aqueles que querem retornar, mas ela não é compreendida como uma opção única para todos os casos. A migração não é considerada uma perda permanente para o País se o membro da diáspora continuar contribuindo para a realização de pesquisas nacionais. Podem ser estabelecidas estratégias de engajamento com os membros da diáspora, que vão além de seu retorno físico ao país de origem.

Disponível em: https://theconversation.com/. Acesso em: 2 jun. 2025 (adaptado).

Considerando o texto, assinale a opção que apresenta uma estratégia adequada para motivar pesquisadores que migraram do Brasil para o exterior a continuarem colaborando para o desenvolvimento da ciência, da inovação e da tecnologia do país.
""", {
    "A": "Implementar um sistema de mentoria por meio do qual os membros da diáspora preparem estudantes brasileiros para trabalharem em instituições de pesquisa no exterior.",
    "B": "Promover iniciativas de reconexão dos membros da diáspora com as atividades científicas no Brasil, com vistas ao seu retorno ao País ou à sua cooperação com instituições de pesquisa nacionais.",
    "C": "Criar um programa governamental que busque reduzir o desemprego de profissionais com mestrado, doutorado ou pós-doutorado no Brasil, principal causa da migração dessas pessoas para outros países.",
    "D": "Desestimular o deslocamento de novos pesquisadores por meio de leis que incentivem a permanência em seu local de formação, de modo a contribuir para o desenvolvimento científico e tecnológico nacional.",
}, "B"))

# ── Q11 ───────────────────────────────────────────────────────────
questions.append(q(11, """
TEXTO 1
A escala de trabalho é um elemento fundamental na organização das atividades laborais e corresponde ao período em que o trabalhador está à disposição da empresa. Ela determina as horas de trabalho, os dias da semana e os turnos de trabalho. No Brasil, são utilizados diversos tipos de escala, que variam conforme a natureza da função e as necessidades operacionais da empresa. No entanto, todas devem respeitar os limites impostos pela legislação vigente, que indica uma jornada de trabalho máxima de 44 horas semanais e de 220 horas mensais, exceto em casos previstos em convenções coletivas ou acordos de trabalho. É importante ressaltar que a escolha do modelo de escala influencia diretamente a produtividade e o bem-estar das pessoas. Exemplo disso são as críticas crescentes que a escala de trabalho 6x1 (correspondente a 6 dias de trabalho e 1 dia de folga, por semana) tem recebido, pelos efeitos que ela promove sobre a saúde, a produtividade e a vida pessoal dos trabalhadores.

ECODEBATE. Escala de trabalho 6x1 é desumana e ineficiente. Disponível em: https://www.ecodebate.com.br/. Acesso em: 3 jun. 2025 (adaptado).

TEXTO 2
Dá nova redação ao inciso XIII do artigo 7º da Constituição Federal para dispor sobre a redução da jornada de trabalho para quatro dias por semana no Brasil.

[...]

XIII – duração do trabalho normal não superior a oito horas diárias e trinta e seis horas semanais, com jornada de trabalho de quatro dias por semana, facultada a compensação de horários e a redução de jornada, mediante acordo ou convenção coletiva de trabalho.

BRASIL. Proposta de Emenda à Constituição n. 8 de 2025. Disponível em: https://www.congressonacional.leg.br/. Acesso em: 4 set. 2025.

Esta Emenda à Constituição é um passo importante na construção de um mercado de trabalho mais justo, sustentável e adaptável às rápidas mudanças do século XXI, assegurando que o progresso econômico do Brasil seja alcançado de maneira inclusiva e equitativa, respeitando as necessidades e o bem-estar de sua força de trabalho.

A partir do exposto nos Textos 1 e 2, assinale a opção correta, quanto ao impacto de diferentes escalas de trabalho na vida do trabalhador.
""", {
    "A": "A escala 4x3, em comparação com as escalas 6x1 e 5x2, possibilita que o trabalhador tenha mais dias de descanso, o que pode aumentar sua motivação e produtividade.",
    "B": "A escala 6x1, em comparação com as escalas 5x2 e 4x3, gera naturalmente trabalhadores mais produtivos, pois possibilita que as pessoas trabalhem mais dias por semana.",
    "C": "A escala 6x1, em comparação com as escalas 5x2 e 4x3, garante uma menor rotatividade de trabalhadores nas empresas, o que permite maior segurança e estabilidade de emprego.",
    "D": "A escala 5x2, em comparação com as escalas 6x1 e 4x3, é mais utilizada nas empresas do País, oferecendo ao trabalhador dias fixos de descanso aos finais de semana, por determinação legal.",
}, "A"))

# ── Q12 ───────────────────────────────────────────────────────────
questions.append(q(12, """
No povo Xakriabá, existem diferentes perfis de conhecedores da tradição. As mulheres são responsáveis pelas roças. Os homens trabalham, mas apenas durante a derrubada. A partir da plantação, toda a responsabilidade é da mulher: plantio, colheita, preparo, cozimento e produção dos alimentos. As mulheres também são responsáveis pela transmissão do conhecimento à família, atuando como guardiãs da biodiversidade e promovendo a circulação de sementes no território, mantendo uma rede de trocas. Os momentos de colheita reúnem as famílias em torno da contação de histórias, interação que contribui para a preservação da língua. O artesanato também é, na maioria das vezes, produzido pelas mulheres, que repassam as técnicas às suas filhas. O período de estudo do barro representa um período em que não existia a presença da instituição escola, mas já havia a educação indígena, transmitida pelo entoar da palavra. As pinturas corporais, que também fazem parte dessa cultura, ao marcarem a identidade no contato entre o corpo e o espírito, foram, por muito tempo, reproduzidas em cerâmicas depositadas na terra. A cerâmica foi, portanto, um elemento muito importante, porque serviu mais tarde como um mostruário das pinturas corporais.

XAKRIABÁ, C. Amansar o giz. Piseagrama, Belo Horizonte, n. 14, p. 110-117, jul. 2020 (adaptado).

Com base no texto e considerando a relação do povo Xakriabá com o seu território, assinale a opção que apresenta um método ativo de conservação do meio ambiente.
""", {
    "A": "Registro, em cerâmicas, de técnicas ancestrais de manejo e conservação da terra.",
    "B": "Retirada de barro para a produção de artesanato que afirme a identidade indígena.",
    "C": "Contação de histórias no período da colheita, com o intuito de preservar a língua.",
    "D": "Plantio rotativo em pequenas áreas, facilitado pela biodiversidade das sementes.",
}, "D"))

# ── Q13 ───────────────────────────────────────────────────────────
questions.append(q(13, """
A implantação do teletrabalho no Tribunal de Justiça de Pernambuco (TJPE) representa um marco significativo na modernização das atividades judiciais e administrativas, alinhando-se às demandas contemporâneas de eficiência, flexibilidade e sustentabilidade ambiental. Essa modalidade de trabalho trouxe oportunidades relevantes, como a redução de custos operacionais, a descentralização das atividades e o aprimoramento da qualidade de vida dos servidores. Além disso, impulsionou a transformação digital da instituição, fortalecendo o uso de ferramentas tecnológicas e promovendo maior celeridade processual.

MACHADO, M.; SANTOS, M. Teletrabalho: desafios, oportunidades e impactos na dinâmica do trabalho contemporâneo. Revista Ibero-Americana de Humanidades, Ciências e Educação, São Paulo, v. 11, n. 1, jan. 2025 (adaptado).

Considerando as informações do texto, assinale a opção que apresenta uma estratégia que viabilizaria a consolidação do teletrabalho como prática eficiente e sustentável na administração pública.
""", {
    "A": "Investir continuamente em infraestrutura tecnológica, capacitação dos servidores e suporte técnico, bem como fortalecer as políticas de gestão de pessoas.",
    "B": "Permitir que os servidores estabeleçam a própria rotina de trabalho, definindo unilateralmente suas metas, seus prazos e os melhores canais de comunicação.",
    "C": "Realizar reuniões virtuais diárias com toda a equipe, logo após o fim do expediente, com vistas ao acompanhamento e ao monitoramento das atividades realizadas no dia.",
    "D": "Reforçar os mecanismos de controle do ponto eletrônico com o objetivo de mensurar a efetividade e a produtividade do servidor, além do seu engajamento com as políticas da instituição.",
}, "A"))

# ── Q14 ───────────────────────────────────────────────────────────
questions.append(q(14, """
TEXTO 1
Os dados referentes ao censo da educação superior de 2023 retratam o aumento do número de alunos com deficiência matriculados no ensino superior, que apresentou um crescimento de 17% em relação aos dados de 2022, superior à taxa de crescimento do total de alunos matriculados no território brasileiro, equivalente a 5,6% no mesmo período. Embora esse crescimento seja expressivo, em termos de representatividade, a presença de alunos com deficiência é de apenas 0,93% do número do total de matrículas, que em 2023 foi de quase 10 milhões de alunos. Nesse mesmo ano, foram registrados 92 756 alunos com deficiência matriculados no ensino superior. O censo também revelou que 12 651 alunos com deficiência concluíram seus cursos.

Disponível em: https://diariopcd.com.br/2024/11/03/cresce-numero-de-alunos-com-deficiencia-no-ensino-superior/. Acesso em: 15 jun. 2025 (adaptado).

TEXTO 2
Total de matrículas de graduação conforme o tipo de deficiência, transtorno global do desenvolvimento ou altas habilidades/superdotação declarados – Brasil – 2023

BRASIL. Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira. Resumo técnico do Censo da Educação Superior 2023 [recurso eletrônico]. Disponível em: https://portal.inep.gov.br. Acesso em: 15 jun. 2025 (adaptado).

Acerca da matrícula de pessoas com deficiência no ensino superior no Brasil, conclui-se, a partir dos Textos 1 e 2, que
""", {
    "A": "a diversidade de deficiências é adequadamente contemplada nas políticas de ingresso, haja vista a preponderância de deficiências físicas e de baixa visão entre os matriculados no ensino superior.",
    "B": "as barreiras de acesso dessas pessoas ao ensino superior estão superadas, haja vista o aumento percentual de matrículas e os diversos tipos de deficiência declarados pelos alunos matriculados.",
    "C": "a inclusão dessas pessoas no ensino superior ainda enfrenta desafios, haja vista a disparidade entre o aumento percentual das matrículas de alunos com deficiência e sua baixa representatividade no total de matrículas.",
    "D": "as políticas de permanência e êxito são eficazes e o baixo percentual de representatividade de alunos com deficiência é um dado inicial que pouco interfere em seu sucesso acadêmico, haja vista o total de pessoas que concluem o curso.",
}, "C", image="/uploads/enade-2025-adm-fg-q14.png"))

# ── Q15 ───────────────────────────────────────────────────────────
questions.append(q(15, """
Domicílios com esgotamento sanitário e taxa de mortalidade infantil por regiões – Brasil – 2022 (%)

IBGE. Dados de Esgotamento Sanitário. Censo 2022. Dados de Mortalidade Infantil, Ministério da Saúde/SVS. Sistema de Informações sobre Mortalidade (SIM), 2022 (adaptado).

A melhora da saúde pública, mediante ações preventivas, ainda é um desafio, principalmente em relação ao saneamento, pois a eficiência, a qualidade e a universalidade desse serviço público são fundamentais para a qualidade de vida da população. O saneamento básico é um dos serviços de infraestrutura cuja ausência ou precariedade causa diversos problemas econômicos, ambientais, sociais e de saúde, com significativas perdas materiais e humanas. O saneamento é um serviço vinculado à saúde pública e demanda grandes investimentos, sendo a universalização um dos objetivos a serem alcançados pelo governo.

Disponível em: https://bnb.gov.br/revista/. Acesso em: 12 de jun. 2025 (adaptado).

Os dados de esgotamento sanitário e de mortalidade infantil apresentados evidenciam
""", {
    "A": "diferenças expressivas entre as regiões do Brasil, sendo o Nordeste a região com as piores condições de saneamento e taxas mais elevadas de mortalidade infantil.",
    "B": "predomínio de domicílios sem esgotamento sanitário na região Norte, o que sugere uma relação entre esse índice e a elevada taxa de mortalidade infantil da região.",
    "C": "inexistência de relação entre saneamento básico e mortalidade infantil na região Sul, pois ela apresenta a maior porcentagem de domicílios com esgotamento sanitário no País.",
    "D": "necessidade de investimentos em saneamento básico na região Sudeste, que apresenta o maior contingente populacional e, consequentemente, os piores indicadores de mortalidade infantil.",
}, "B", image="/uploads/enade-2025-adm-fg-q15.png"))

# Save JSON
with open('/home/z/my-project/upload/adm_questions.json', 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print(f"Created {len(questions)} questions")
for q in questions:
    print(f"  Q{q['title'].split('Questão ')[1]}: correct={q['correctAnswer']}, image={q['imageUrl'] or 'none'}, text_len={len(q['text'])}")
