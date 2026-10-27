// -----------------------------------------------------------------------------
// Entry point of the Agora Famille calendar integration for Gladys Assistant.
//
// Creates the SDK instance, hands it to the integration (src/app.js, where
// every handler lives) and connects. The SDK reads the three variables the
// Gladys supervisor injects in the container (GLADYS_HOST_API_URL,
// GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
const app = createApp(gladys);

// A rejection nobody awaited must not take the integration down with it.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

logger.info('Starting the Agora Famille calendar integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
