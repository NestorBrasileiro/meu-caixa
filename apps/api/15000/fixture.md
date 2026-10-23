# Meu Caixa — Exportação financeira

- **Período:** 01/08/2026 a 23/10/2026
- **Gerado em:** 23/10/2026 14:05 (America/Sao_Paulo)
- **Última sincronização:** 23/10/2026 13:58 — Concluída (manual)
- **Seções:** Resumo, Contas, Cartões, Faturas, Parcelamentos, Empréstimos, Compromissos fixos, Metas, Orçamento, Projeção, Fluxo de caixa, Gastos por categoria, Recorrências, Transações, Análise do Claude

## Como usar

Anexe este arquivo (ou cole o conteúdo) numa conversa com o ChatGPT, o Claude.ai ou o Gemini e mande o pedido abaixo — ou leia direto: cada seção é uma tabela.

```text
Este arquivo é o meu relatório financeiro exportado do Meu Caixa (valores em R$; negativos são saídas;
pagamentos de fatura e transferências entre minhas próprias contas não são gasto novo). Analise meus gastos e responda em português:
1. Para onde vai o meu dinheiro: categorias e estabelecimentos que mais pesam e o que mudou de um mês para o outro.
2. Vazamentos: assinaturas esquecidas ou duplicadas, tarifas bancárias, juros, multas e cobranças estranhas.
3. "Gastos do pecado": supérfluos recorrentes (delivery, corridas de app, compras por impulso) e quanto custam por mês e por ano.
4. Gasto fixo x discricionário, como estão o orçamento, as metas e a projeção dos próximos meses.
5. Parcelamentos, empréstimos e compromissos que vão apertar os próximos meses.
6. Uma lista priorizada de cortes, com a economia mensal estimada de cada um e um plano simples para o próximo mês.
Use só os números do arquivo, cite as transações que embasam cada ponto e diga quando faltar informação.
```

## Convenções

- Valores em reais (R$). Negativos são saídas de dinheiro; positivos, entradas.
- Pagamento de fatura e transferência entre contas próprias não são gasto nem renda (as compras do cartão já contam como gasto na data da compra): nas transações, aparecem com "Interna = Sim".
- Nos cartões, "dívida" é o valor em aberto (quanto se deve), não um saldo negativo.
- Datas em dd/mm/aaaa, no fuso de Brasília. Meses marcados como parciais não estão completos no período.
- Categoria: a escolhida no Meu Caixa quando você editou; a original do banco aparece em "Categoria original".

## 1. Resumo

_Saldo em contas, dívida e limite dos cartões, resultado do período, contagens, avisos sobre dados desatualizados e convenções._

### Exportação

| Item | Valor |
| --- | ---: |
| Período | 01/08/2026 a 23/10/2026 |
| Gerado em | 23/10/2026 14:05 (America/Sao_Paulo) |
| Última sincronização | 23/10/2026 13:58 — Concluída (manual) |

### Saldos e dívidas (agora)

| Item | Valor |
| --- | ---: |
| Saldo em contas | R$ 20.950,32 |
| Dívida dos cartões (em aberto) | R$ 4.312,48 |
| Saldo em contas menos dívida dos cartões | R$ 16.637,84 |
| Limite total dos cartões | R$ 23.000,00 |
| Limite disponível nos cartões | R$ 18.687,52 |
| Parcelas de cartão a vencer | R$ 3.150,00 |
| Saldo devedor de empréstimos | R$ 18.420,77 |
| Compromissos fixos do mês atual | R$ 2.300,00 |

### Resultado do período

| Item | Valor |
| --- | ---: |
| Entradas | R$ 27.000,00 |
| Saídas (gastos) | -R$ 21.345,67 |
| Saldo do período | R$ 5.654,33 |
| Taxa de poupança | 20,9% |
| Pagamentos de fatura (não contam como gasto) | -R$ 9.120,00 |
| Transferências para contas próprias (não contam) | -R$ 4.500,00 |

### Contagens

| Item | Valor |
| --- | ---: |
| Bancos conectados | 2 |
| Contas | 2 |
| Cartões de crédito | 2 |
| Transações no período | 60 |
| Faturas | 4 |
| Parcelamentos em aberto | 2 |
| Empréstimos | 1 |
| Compromissos fixos | 2 |
| Metas | 1 |

### Conexões

| Banco | Status da conexão | Atualizada no banco em |
| --- | --- | ---: |
| Banco Exemplo | Ativa | 23/10/2026 13:58 |
| Cartão Exemplo | Precisa reconectar | 12/10/2026 06:00 |

### Avisos sobre os dados

- **Atenção:** Cartão Exemplo: a conexão precisa de ação (reconecte no Meu Pluggy); os dados deste banco podem estar desatualizados.

### Convenções

- Valores em reais (R$). Negativos são saídas de dinheiro; positivos, entradas.
- Pagamento de fatura e transferência entre contas próprias não são gasto nem renda (as compras do cartão já contam como gasto na data da compra): nas transações, aparecem com "Interna = Sim".
- Nos cartões, "dívida" é o valor em aberto (quanto se deve), não um saldo negativo.
- Datas em dd/mm/aaaa, no fuso de Brasília. Meses marcados como parciais não estão completos no período.
- Categoria: a escolhida no Meu Caixa quando você editou; a original do banco aparece em "Categoria original".

## 2. Contas

_Todas as contas e cartões conectados: banco, tipo, saldo (ou dívida do cartão), limite, disponível e até quando foram sincronizados._

| Banco | Tipo | Nome | Número | Saldo | Dívida do cartão | Limite | Disponível | Sincronizado até | Conexão |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Banco Exemplo | Conta corrente | Conta corrente | 12345-6 | R$ 8.450,32 |  |  |  | 23/10/2026 | Ativa |
| Banco Exemplo | Poupança | Poupança | 12345-7 | R$ 12.500,00 |  |  |  | 23/10/2026 | Ativa |
| Cartão Exemplo | Cartão de crédito | Cartão Platinum | 4321 |  | R$ 3.124,80 | R$ 15.000,00 | R$ 11.875,20 | 12/10/2026 | Precisa reconectar |
| Cartão Exemplo | Cartão de crédito | Cartão Adicional | 8765 |  | R$ 1.187,68 | R$ 8.000,00 | R$ 6.812,32 | 12/10/2026 | Precisa reconectar |
| **Total** |  |  |  | **R$ 20.950,32** | **R$ 4.312,48** | **R$ 23.000,00** | **R$ 18.687,52** |  |  |

## 3. Cartões

_Cada cartão de crédito: limite, usado, disponível, % de uso e a fatura em aberto._

| Banco | Cartão | Final | Limite | Usado | Disponível | % de uso | Fatura aberta | Fecha em | Vence em |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cartão Exemplo | Cartão Platinum | 4321 | R$ 15.000,00 | R$ 3.124,80 | R$ 11.875,20 | 20,8% | R$ 3.124,80 | 03/11/2026 | 10/11/2026 |
| Cartão Exemplo | Cartão Adicional | 8765 | R$ 8.000,00 | R$ 1.187,68 | R$ 6.812,32 | 14,8% |  |  |  |
| **Total** |  |  | **R$ 23.000,00** | **R$ 4.312,48** | **R$ 18.687,52** |  | **R$ 3.124,80** |  |  |

## 4. Faturas

_Histórico de faturas por cartão (fechamento, vencimento, total e mínimo)._

| Banco | Cartão | Fechamento | Vencimento | Total | Pagamento mínimo | Situação |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Cartão Exemplo | Cartão Platinum | 03/11/2026 | 10/11/2026 | R$ 3.124,80 | R$ 468,72 | A vencer |
| Cartão Exemplo | Cartão Platinum | 03/10/2026 | 10/10/2026 | R$ 2.987,15 | R$ 448,07 | Já venceu |
| Cartão Exemplo | Cartão Platinum | 03/09/2026 | 10/09/2026 | R$ 3.301,40 |  | Já venceu |
| Cartão Exemplo | Cartão Adicional |  | 10/10/2026 | R$ 1.045,00 |  | Já venceu |

- Faturas com vencimento a partir do início do período, inclusive as futuras.

## 5. Parcelamentos

_Compras parceladas no cartão ainda em aberto: parcela atual, valor, próxima, fim e quanto falta pagar._

| Compra | Cartão | Parcela atual | Valor da parcela | Próxima parcela | Termina em | Parcelas restantes | Valor restante |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Loja Exemplo — Geladeira | Cartão Platinum | 4/10 | R$ 450,00 | 12/11/2026 | 12/05/2027 | 7 | R$ 3.150,00 |
| Ótica São João | Cartão Adicional | 6/6 | R$ 199,90 | 05/11/2026 | 05/11/2026 | 1 | R$ 199,90 |
| **Total** |  |  | **R$ 649,90** |  |  | **8** | **R$ 3.349,90** |

- Deduzido das parcelas que aparecem nas faturas (o Open Finance não informa o plano da compra). Valor restante = parcelas restantes × valor da parcela, contando a atual.

## 6. Empréstimos

_Empréstimos e financiamentos informados pelos bancos: saldo devedor, parcelas, taxa e CET._

| Banco | Produto | Contrato | Contratado | Saldo devedor | Parcelas pagas | Total de parcelas | Restantes | Atrasadas | Valor da parcela | Próxima parcela | Valor da próxima | Taxa a.a. | CET a.a. | Contratado em | Vencimento final | Periodicidade |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Banco Exemplo | Crédito pessoal | 000123 | R$ 25.000,00 | R$ 18.420,77 | 16 | 36 | 20 | 0 | R$ 1.032,10 | 15/11/2026 | R$ 1.032,10 | 23,5% | 26,8% | 15/06/2025 | 15/06/2028 | Mensal |

- Dados informados pelos bancos via Open Finance. Financiamentos que o banco não compartilha (ex.: com loteadora) ficam em "Compromissos fixos" quando cadastrados.

## 7. Compromissos fixos

_Gastos fixos cadastrados (ex.: parcela do terreno), com parcelas pagas, fim e valor restante._

| Compromisso | Valor mensal | Dia | Forma de pagamento | Categoria | Início | Fim | Parcelas pagas | Parcelas restantes | Valor restante | Ativo no mês | Observações |
| --- | ---: | ---: | --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- |
| Parcela do terreno | R$ 2.300,00 | 10 | Boleto | Moradia e contas | 10/09/2023 | 10/08/2033 | 38/120 | 82 | R$ 188.600,00 | Sim | Loteadora; reajuste anual pelo IPCA |
| Academia | R$ 129,90 | 5 | Cartão |  | 05/01/2026 |  |  |  |  | Sim |  |
| **Total** | **R$ 2.429,90** |  |  |  |  |  |  |  | **R$ 188.600,00** |  |  |

## 8. Metas

_Metas de economia com progresso, aporte planejado e aporte necessário._

| Meta | Alvo | Guardado | Falta | Progresso | Data alvo | Meses restantes | Aporte planejado | Aporte necessário | No ritmo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Entrada do carro | R$ 40.000,00 | R$ 12.500,00 | R$ 27.500,00 | 31,3% | 01/12/2027 | 14 | R$ 1.500,00 | R$ 1.964,29 | Não |

## 9. Orçamento

_Categorias de orçamento: teto mensal contra o gasto real em cada mês do período._

| Mês | Categoria | Tipo | Teto mensal | Gasto | Sobra do teto | Uso do teto | Mês parcial |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| ago/2026 | Mercado | Essencial | R$ 1.400,00 | R$ 1.250,00 | R$ 150,00 | 89,3% | Não |
| ago/2026 | Delivery e restaurantes | Discricionário | R$ 600,00 | R$ 720,45 | -R$ 120,45 | 120,1% | Não |
| ago/2026 | Sem categoria de orçamento |  |  | R$ 2.100,00 |  |  | Não |
| set/2026 | Mercado | Essencial | R$ 1.400,00 | R$ 1.370,00 | R$ 30,00 | 97,9% | Não |
| set/2026 | Delivery e restaurantes | Discricionário | R$ 600,00 | R$ 670,45 | -R$ 70,45 | 111,7% | Não |
| set/2026 | Sem categoria de orçamento |  |  | R$ 2.100,00 |  |  | Não |
| out/2026 | Mercado | Essencial | R$ 1.400,00 | R$ 1.490,00 | -R$ 90,00 | 106,4% | Sim |
| out/2026 | Delivery e restaurantes | Discricionário | R$ 600,00 | R$ 620,45 | -R$ 20,45 | 103,4% | Sim |
| out/2026 | Sem categoria de orçamento |  |  | R$ 2.100,00 |  |  | Sim |
|  | **Total** |  | **R$ 6.000,00** | **R$ 12.421,35** | **-R$ 121,35** |  |  |

- Sobra do teto = teto − gasto (negativo = estourou).
- Mercado: Mercado.
- Delivery e restaurantes: Delivery, Restaurantes.

## 10. Projeção

_Projeção dos próximos 6 meses: renda esperada, compromissos, aportes e gasto variável._

| Mês | Renda esperada | Compromissos | Aportes em metas | Gasto variável esperado | Saldo projetado |
| ---: | ---: | ---: | ---: | ---: | ---: |
| nov/2026 | R$ 9.000,00 | -R$ 2.429,90 | -R$ 1.500,00 | -R$ 4.120,00 | R$ 950,10 |
| dez/2026 | R$ 9.000,00 | -R$ 2.429,90 | -R$ 1.500,00 | -R$ 4.120,00 | R$ 950,10 |
| jan/2027 | R$ 9.000,00 | -R$ 2.429,90 | -R$ 1.500,00 | -R$ 4.120,00 | R$ 950,10 |
| fev/2027 | R$ 9.000,00 | -R$ 2.429,90 | -R$ 1.500,00 | -R$ 4.120,00 | R$ 950,10 |
| mar/2027 | R$ 9.000,00 | -R$ 2.429,90 | -R$ 1.500,00 | -R$ 4.120,00 | R$ 950,10 |
| abr/2027 | R$ 9.000,00 | -R$ 2.429,90 | -R$ 1.500,00 | -R$ 4.120,00 | R$ 950,10 |
| **Total** | **R$ 54.000,00** | **-R$ 14.579,40** | **-R$ 9.000,00** | **-R$ 24.720,00** | **R$ 5.700,60** |

- Renda média dos 3 últimos meses fechados − compromissos ativos no mês − aportes das metas ainda não atingidas − gasto variável médio (gasto total médio menos os compromissos).

## 11. Fluxo de caixa

_Entradas, saídas e saldo de cada mês do período._

| Mês | Parcial | Entradas | Saídas | Saldo | Taxa de poupança | Pagamentos de fatura | Transferências p/ contas próprias |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ago/2026 | Não | R$ 9.000,00 | -R$ 7.345,67 | R$ 1.654,33 | 18,4% | -R$ 3.301,40 | -R$ 1.500,00 |
| set/2026 | Não | R$ 9.000,00 | -R$ 9.600,00 | -R$ 600,00 | -6,7% | -R$ 2.987,15 | -R$ 1.500,00 |
| out/2026 | Sim | R$ 9.000,00 | -R$ 4.400,00 | R$ 4.600,00 | 51,1% | -R$ 2.831,45 | -R$ 1.500,00 |
|  | **Total** | **R$ 27.000,00** | **-R$ 21.345,67** | **R$ 5.654,33** |  | **-R$ 9.120,00** | **-R$ 4.500,00** |

- Saídas = gastos (compras no cartão na data da compra). Pagamentos de fatura e transferências para contas próprias ficam à parte e não entram no saldo.

## 12. Gastos por categoria

_Total gasto por categoria no período, com número de transações e participação._

| Categoria | Total gasto | Transações | % do total | Média mensal |
| --- | ---: | ---: | ---: | ---: |
| Moradia | R$ 6.900,00 | 3 | 32,3% | R$ 2.300,00 |
| Mercado | R$ 4.110,00 | 12 | 19,3% | R$ 1.370,00 |
| Delivery | R$ 1.911,35 | 24 | 9,0% | R$ 637,12 |
| Streaming de vídeo | R$ 167,70 | 3 | 0,8% | R$ 55,90 |
| Sem categoria | R$ 8.256,62 | 31 | 38,7% | R$ 2.752,21 |
| **Total** | **R$ 21.345,67** | **73** |  | **R$ 7.115,23** |

- Média mensal sobre 3 meses do período. Pagamento de fatura e transferência própria não entram.

## 13. Recorrências

_Cobranças que se repetem: assinaturas, contas fixas, hábitos frequentes e parcelamentos._

| Descrição | Contraparte | Categoria | Padrão | Ativa | Cobranças | Meses | Valor típico | Último valor | Última cobrança | Custo mensal | Custo anual | Parcela | Contas |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Parcela terreno | Loteadora Exemplo | Moradia | Assinatura ou conta fixa | Sim | 6 | 6 | R$ 2.300,00 | R$ 2.300,00 | 10/10/2026 | R$ 2.300,00 | R$ 27.600,00 |  | Conta corrente |
| Delivery Exemplo | Delivery Exemplo | Delivery | Hábito frequente | Sim | 48 | 6 | R$ 79,63 | R$ 61,20 | 18/10/2026 | R$ 637,12 | R$ 7.645,44 |  | Cartão Platinum |
| Streaming Exemplo | Streaming Exemplo | Streaming de vídeo | Assinatura ou conta fixa | Sim | 6 | 6 | R$ 55,90 | R$ 55,90 | 01/10/2026 | R$ 55,90 | R$ 670,80 |  | Cartão Platinum |
| Loja Exemplo — Geladeira | Loja Exemplo | Compras | Parcelamento | Sim | 3 | 3 | R$ 450,00 | R$ 450,00 | 12/10/2026 | R$ 450,00 |  | 3/10 | Cartão Platinum |
| **Total** |  |  |  |  |  |  |  |  |  | **R$ 3.443,02** | **R$ 35.916,24** |  |  |

- Analisado de 01/05/2026 a 23/10/2026: mesma origem com gasto em pelo menos 3 meses diferentes. "Ativa" = cobrada nos últimos 40 dias.
- Custo mensal estimado das recorrências ativas (sem parcelamentos): R$ 2.993,02.

## 14. Transações

_Todas as transações do período, com conta, categoria, forma de pagamento, parcela e status._

| Data | Banco | Conta | Descrição | Contraparte | Categoria | Categoria original | Forma de pagamento | Parcela | Status | Tipo | Interna | Valor |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| 05/08/2026 | Banco Exemplo | Conta corrente | Salário | Empresa Exemplo Ltda | Salário |  | TED |  | Efetivada | Receita | Não | R$ 9.000,00 |
| 06/08/2026 | Banco Exemplo | Conta corrente | Aporte entrada do carro |  | Transferência para poupança |  | Outra |  | Efetivada | Transferência própria | Sim | -R$ 1.500,00 |
| 09/08/2026 | Banco Exemplo | Conta corrente | Supermercado 8 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 18,01 |
| 10/08/2026 | Banco Exemplo | Conta corrente | Parcela terreno | Loteadora Exemplo | Moradia |  | Boleto |  | Efetivada | Gasto | Não | -R$ 2.300,00 |
| 10/08/2026 | Banco Exemplo | Conta corrente | Supermercado 9 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 19,02 |
| 11/08/2026 | Banco Exemplo | Conta corrente | Supermercado 10 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 20,03 |
| 12/08/2026 | Cartão Exemplo | Cartão Platinum | Loja Exemplo — Geladeira | Loja Exemplo | Compras |  | Cartão | 1/10 | Efetivada | Gasto | Não | -R$ 450,00 |
| 12/08/2026 | Banco Exemplo | Conta corrente | Supermercado 11 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 21,04 |
| 13/08/2026 | Banco Exemplo | Conta corrente | Supermercado 12 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 22,05 |
| 14/08/2026 | Banco Exemplo | Conta corrente | Supermercado 13 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 23,06 |
| 15/08/2026 | Banco Exemplo | Conta corrente | Pagamento fatura cartão | Cartão Exemplo | Pagamento de fatura |  | Outra |  | Efetivada | Pagamento de fatura | Sim | -R$ 3.301,40 |
| 15/08/2026 | Banco Exemplo | Conta corrente | Supermercado 14 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 24,00 |
| 16/08/2026 | Banco Exemplo | Conta corrente | Supermercado 15 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 25,01 |
| 17/08/2026 | Banco Exemplo | Conta corrente | Supermercado 16 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 26,02 |
| 18/08/2026 | Banco Exemplo | Conta corrente | Supermercado 17 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 27,03 |
| 19/08/2026 | Banco Exemplo | Conta corrente | Supermercado 18 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 28,04 |
| 20/08/2026 | Banco Exemplo | Conta corrente | Supermercado 19 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 29,05 |
| 21/08/2026 | Banco Exemplo | Conta corrente | Supermercado 20 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 30,06 |
| 22/08/2026 | Banco Exemplo | Conta corrente | Supermercado 21 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 31,00 |
| 23/08/2026 | Banco Exemplo | Conta corrente | Supermercado 22 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 32,01 |
| 24/08/2026 | Banco Exemplo | Conta corrente | Supermercado 23 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 33,02 |
| 25/08/2026 | Banco Exemplo | Conta corrente | Supermercado 24 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 34,03 |
| 26/08/2026 | Banco Exemplo | Conta corrente | Supermercado 25 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 35,04 |
| 27/08/2026 | Banco Exemplo | Conta corrente | Supermercado 26 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 36,05 |
| 28/08/2026 | Banco Exemplo | Conta corrente | Supermercado 27 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 37,06 |
| 29/08/2026 | Banco Exemplo | Conta corrente | Supermercado 28 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 38,00 |
| 30/08/2026 | Banco Exemplo | Conta corrente | Supermercado 29 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 39,01 |
| 31/08/2026 | Banco Exemplo | Conta corrente | Supermercado 30 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 40,02 |
| 01/09/2026 | Banco Exemplo | Conta corrente | Supermercado 31 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 41,03 |
| 02/09/2026 | Banco Exemplo | Conta corrente | Padaria "Pão; Café \| Cia" |  | Restaurantes | Mercado | Pix |  | Efetivada | Gasto | Não | -R$ 32,50 |
| 02/09/2026 | Banco Exemplo | Conta corrente | Supermercado 32 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 42,04 |
| 03/09/2026 | Banco Exemplo | Conta corrente | =HYPERLINK("x") |  | Sem categoria |  |  |  | Efetivada | Gasto | Não | -R$ 1,00 |
| 03/09/2026 | Banco Exemplo | Conta corrente | Supermercado 33 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 43,05 |
| 04/09/2026 | Banco Exemplo | Conta corrente | Supermercado 34 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 44,06 |
| 05/09/2026 | Banco Exemplo | Conta corrente | Supermercado 35 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 45,00 |
| 06/09/2026 | Banco Exemplo | Conta corrente | Supermercado 36 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 46,01 |
| 07/09/2026 | Banco Exemplo | Conta corrente | Supermercado 37 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 47,02 |
| 08/09/2026 | Banco Exemplo | Conta corrente | Supermercado 38 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 48,03 |
| 09/09/2026 | Banco Exemplo | Conta corrente | Supermercado 39 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 49,04 |
| 10/09/2026 | Banco Exemplo | Conta corrente | Supermercado 40 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 50,05 |
| 11/09/2026 | Banco Exemplo | Conta corrente | Supermercado 41 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 51,06 |
| 12/09/2026 | Banco Exemplo | Conta corrente | Supermercado 42 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 52,00 |
| 13/09/2026 | Banco Exemplo | Conta corrente | Supermercado 43 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 53,01 |
| 14/09/2026 | Banco Exemplo | Conta corrente | Supermercado 44 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 54,02 |
| 15/09/2026 | Banco Exemplo | Conta corrente | Supermercado 45 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 55,03 |
| 16/09/2026 | Banco Exemplo | Conta corrente | Supermercado 46 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 56,04 |
| 17/09/2026 | Banco Exemplo | Conta corrente | Supermercado 47 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 57,05 |
| 18/09/2026 | Banco Exemplo | Conta corrente | Supermercado 48 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 58,06 |
| 19/09/2026 | Banco Exemplo | Conta corrente | Supermercado 49 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 59,00 |
| 20/09/2026 | Banco Exemplo | Conta corrente | Supermercado 50 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 60,01 |
| 21/09/2026 | Banco Exemplo | Conta corrente | Supermercado 51 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 61,02 |
| 22/09/2026 | Banco Exemplo | Conta corrente | Supermercado 52 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 62,03 |
| 23/09/2026 | Banco Exemplo | Conta corrente | Supermercado 53 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 63,04 |
| 24/09/2026 | Banco Exemplo | Conta corrente | Supermercado 54 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 64,05 |
| 25/09/2026 | Banco Exemplo | Conta corrente | Supermercado 55 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 65,06 |
| 26/09/2026 | Banco Exemplo | Conta corrente | Supermercado 56 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 66,00 |
| 27/09/2026 | Banco Exemplo | Conta corrente | Supermercado 57 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 67,01 |
| 28/09/2026 | Banco Exemplo | Conta corrente | Supermercado 58 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 68,02 |
| 29/09/2026 | Banco Exemplo | Conta corrente | Supermercado 59 | Mercado Exemplo | Mercado |  | Pix |  | Efetivada | Gasto | Não | -R$ 69,03 |
| 22/10/2026 | Cartão Exemplo | Cartão Platinum | Açaí da Esquina | Açaí da Esquina Ltda | Delivery |  | Cartão |  | Pendente | Gasto | Não | -R$ 27,90 |
|  | **Total** |  |  |  |  |  |  |  |  |  |  | **-R$ 876,33** |

## 15. Análise do Claude

_A última análise salva pelo Claude (manchete, resumo e sugestões), se houver._

| Item | Valor |
| --- | ---: |
| Gerada em | 20/10/2026 10:00 |
| Origem | Seu Claude (MCP) |
| Modelo | claude-opus-5-5 |
| Período analisado | 01/07/2026 a 30/09/2026 |
| Manchete | Delivery e assinaturas levam R$ 700 por mês; dá para guardar mais. |
| Gasto fixo por mês | R$ 3.200,00 |
| Gasto discricionário por mês | R$ 3.900,00 |
| Economia potencial por mês | R$ 520,00 |

### Resumo

Você fechou setembro no vermelho por causa do delivery e de compras parceladas.
A parcela do terreno é o maior gasto fixo; o resto é discricionário.

### Sugestões

| Tipo | Título | Explicação | Economia mensal | Confiança | Evidência |
| --- | --- | --- | ---: | --- | --- |
| Gasto do pecado | Delivery 2x por semana | São 8 pedidos por mês, média de R$ 79,63. Cortar pela metade economiza. | R$ 320,00 | Alta | Delivery: 24 transações, R$ 1.911,35 (01/07/2026 a 30/09/2026) |
| Vazamento | Streaming sem uso | Assinatura ativa há 6 meses. | R$ 55,90 | Média |  |
| **Total** |  |  | **R$ 375,90** |  |  |
