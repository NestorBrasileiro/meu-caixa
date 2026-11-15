import { stalePendingWarnings } from './export-data.service.js';

const row = (date: string, status: 'PENDING' | 'POSTED', accountName = 'Cartão') => ({
  date,
  status,
  institutionName: 'Banco',
  accountName,
});

describe('stalePendingWarnings', () => {
  it('avisa as pendentes com mais de 15 dias, por conta, com a mais antiga', () => {
    expect(
      stalePendingWarnings(
        [
          row('2026-10-01', 'PENDING'),
          row('2026-09-20', 'PENDING'),
          row('2026-10-25', 'PENDING'),
          row('2026-09-01', 'POSTED'),
        ],
        '2026-11-01',
      ),
    ).toEqual([
      'Banco — Cartão: 2 lançamentos pendentes há mais de 15 dias (o mais antigo de 20/09/2026). Se já foram efetivados, use "Ressincronizar tudo" na tela Contas para limpar.',
    ]);
  });

  it('sem pendente antiga, nada', () => {
    expect(stalePendingWarnings([row('2026-10-25', 'PENDING')], '2026-11-01')).toEqual([]);
  });
});
