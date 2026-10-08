import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { loadEnvFile } from '../config/load-env-file.js';
import { budgetCategories, commitments, goals } from './schema.js';
import * as schema from './schema.js';

/**
 * Dados de exemplo do planejamento para desenvolvimento (só insere se as
 * tabelas estiverem vazias): categorias de orçamento, a parcela do terreno e
 * a meta da entrada do carro.  Uso: `pnpm --filter api db:seed`.
 */
async function main(): Promise<void> {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definido');
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  try {
    const existing = await db.select({ id: commitments.id }).from(commitments).limit(1);
    if (existing.length > 0) {
      console.log('Planejamento já tem dados; nada a fazer.');
      return;
    }
    const categories = await db
      .insert(budgetCategories)
      .values([
        {
          name: 'Moradia e contas',
          kind: 'ESSENTIAL',
          sourceCategories: ['Housing', 'Electricity', 'Internet', 'Telecommunications'],
          monthlyBudget: 2_700_00,
          position: 0,
        },
        {
          name: 'Mercado',
          kind: 'ESSENTIAL',
          sourceCategories: ['Groceries'],
          monthlyBudget: 1_400_00,
          position: 1,
        },
        {
          name: 'Transporte',
          kind: 'ESSENTIAL',
          sourceCategories: ['Gas stations', 'Taxi and ride-hailing'],
          monthlyBudget: 1_000_00,
          position: 2,
        },
        {
          name: 'Delivery e restaurantes',
          kind: 'DISCRETIONARY',
          sourceCategories: ['Food delivery', 'Restaurants'],
          monthlyBudget: 600_00,
          position: 3,
        },
        {
          name: 'Assinaturas',
          kind: 'DISCRETIONARY',
          sourceCategories: ['Video streaming', 'Music streaming'],
          monthlyBudget: 80_00,
          position: 4,
        },
        {
          name: 'Compras',
          kind: 'DISCRETIONARY',
          sourceCategories: ['Shopping', 'Online shopping'],
          monthlyBudget: 500_00,
          position: 5,
        },
      ])
      .returning({ id: budgetCategories.id, name: budgetCategories.name });
    const categoryId = (name: string) => categories.find((c) => c.name === name)?.id ?? null;

    await db.insert(commitments).values([
      {
        name: 'Parcela do terreno',
        amount: 2_300_00,
        dayOfMonth: 10,
        paymentMethod: 'BOLETO',
        categoryId: categoryId('Moradia e contas'),
        startsOn: '2023-09-10',
        installmentsTotal: 120,
        notes: 'Loteadora',
      },
      {
        name: 'Streaming de vídeo',
        amount: 55_90,
        dayOfMonth: 1,
        paymentMethod: 'CARD',
        categoryId: categoryId('Assinaturas'),
        startsOn: '2021-03-01',
      },
    ]);
    await db
      .insert(goals)
      .values([
        {
          name: 'Entrada do carro',
          target: 40_000_00,
          saved: 12_500_00,
          targetDate: '2027-12-01',
          monthlyContribution: 1_500_00,
        },
      ]);
    console.log('Planejamento de exemplo criado.');
  } finally {
    await pool.end();
  }
}

await main();
