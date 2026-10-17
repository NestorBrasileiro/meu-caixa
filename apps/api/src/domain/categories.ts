/**
 * Nomes em português para as categorias do agregador (a Pluggy usa inglês).
 * Mesma lista da interface (apps/web/src/lib/format/category.ts).
 */
const LABELS: Record<string, string> = {
  Salary: 'Salário',
  Housing: 'Moradia',
  'Transfer - Savings': 'Transferência para poupança',
  Transfers: 'Transferências',
  Electricity: 'Energia',
  Internet: 'Internet',
  Telecommunications: 'Telefonia',
  'Bank fees': 'Tarifas bancárias',
  Groceries: 'Mercado',
  Pharmacy: 'Farmácia',
  'Investment income': 'Rendimentos',
  'Food delivery': 'Delivery',
  Restaurants: 'Restaurantes',
  'Video streaming': 'Streaming de vídeo',
  'Music streaming': 'Streaming de música',
  'Gyms and fitness centers': 'Academia',
  'Taxi and ride-hailing': 'Transporte por app',
  'Gas stations': 'Combustível',
  Shopping: 'Compras',
  'Online shopping': 'Compras online',
  'Credit card payment': 'Pagamento de fatura',
  Utilities: 'Contas de consumo',
  'Same person transfer': 'Transferência entre contas próprias',
  'Same person transfer - PIX': 'Pix entre contas próprias',
  'Same person transfer - TED': 'TED entre contas próprias',
};

export function categoryLabel(category: string | null): string {
  if (!category) return 'Sem categoria';
  return LABELS[category] ?? category;
}
