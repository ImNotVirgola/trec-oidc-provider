module.exports = function install(agent) {
  if (process.env.TREC_DIDCOMM_DIAG !== '1') return;

  const dependencies = agent.config.agentDependencies;
  const originalFetch = dependencies.fetch;

  dependencies.fetch = async function(input, options) {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(rawUrl);
    const method = (options?.method || 'GET').toUpperCase();

    const didcomm =
      method === 'POST' &&
      ['3001', '3002', '3003'].includes(url.port);

    const endpoint = url.origin + url.pathname;

    try {
      const response = await originalFetch(input, options);

      if (didcomm) {
        console.error(
          'DIDCOMM_HTTP endpoint=' + endpoint +
          ' status=' + response.status
        );
      }

      return response;
    } catch (error) {
      if (didcomm) {
        console.error(
          'DIDCOMM_HTTP_ERROR endpoint=' + endpoint +
          ' reason=' + error.message +
          ' cause=' + (error.cause?.message || 'none')
        );
      }

      throw error;
    }
  };

  const originalError = agent.config.logger.error.bind(
    agent.config.logger
  );

  agent.config.logger.error = function(message, ...details) {
    if (String(message).includes('Error processing inbound message')) {
      console.error('DIDCOMM_INBOUND_ERROR=' + message);
    }

    return originalError(message, ...details);
  };
};
