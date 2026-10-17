import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../settings/app-settings.module.js';
import { FINANCE_PROVIDER } from './finance-provider.js';
import { FinanceProviderRegistry } from './open-finance/finance-provider.registry.js';
import { OpenFinanceConfigStore } from './open-finance/open-finance-config.store.js';

/**
 * Origem dos dados bancários. O `FinanceProviderRegistry` escolhe a
 * implementação de `FinanceProvider` a cada uso, conforme o ambiente e a tela
 * Configurações → Open Finance. Trocar de agregador = escrever um novo
 * adapter e registrá-lo no registry.
 */
@Module({
  imports: [AppSettingsModule],
  providers: [
    OpenFinanceConfigStore,
    FinanceProviderRegistry,
    // Sem provedor fixo: o registry decide. Os testes e2e sobrescrevem com um
    // provedor em memória (`overrideProvider(FINANCE_PROVIDER)`).
    { provide: FINANCE_PROVIDER, useValue: null },
  ],
  exports: [FinanceProviderRegistry, OpenFinanceConfigStore],
})
export class IntegrationsModule {}
